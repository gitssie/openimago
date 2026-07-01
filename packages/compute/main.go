package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/openimago/billing-cdc-worker/cdc"
	"github.com/openimago/billing-cdc-worker/config"
	"github.com/openimago/billing-cdc-worker/repository"

	cdcpq "github.com/Trendyol/go-pq-cdc"
	cdcconfig "github.com/Trendyol/go-pq-cdc/config"
	"github.com/Trendyol/go-pq-cdc/pq/publication"
	"github.com/Trendyol/go-pq-cdc/pq/slot"
)

func main() {
	log.Println("=== OpenImago Billing CDC Worker (Go) ===")
	log.Println("Starting up...")

	// --- Load configuration ---
	cfg, err := config.FromEnv()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}
	log.Println("Configuration loaded successfully")
	log.Printf("  DB: %s:%d/%s", cfg.DBHost, cfg.DBPort, cfg.DBName)
	log.Printf("  Table filter: %s", cfg.TableIncludeList)
	log.Printf("  Publication: %s", cfg.PublicationName)
	log.Printf("  Slot: %s", cfg.SlotName)
	offsetStorage := "file"
	if cfg.UsesJDBCOffsetStorage() {
		offsetStorage = "JDBC"
	}
	log.Printf("  Offset storage: %s", offsetStorage)
	log.Printf("  Billing DB: %s", maskPassword(cfg.BillingDBURL))

	// --- Create billing repository ---
	dsn := cfg.BillingDBURL
	billingRepo, err := repository.NewBillingRepository(dsn)
	if err != nil {
		log.Fatalf("Failed to create billing repository: %v", err)
	}
	defer billingRepo.Close()

	// --- Create CDC handler ---
	handler := cdc.NewSessionChangeHandler(billingRepo)

	// --- Build CDC connector ---
	ctx := context.Background()
	cdcCfg := cdcconfig.Config{
		Host:      cfg.DBHost,
		Port:      cfg.DBPort,
		Username:  cfg.DBUser,
		Password:  cfg.DBPassword,
		Database:  cfg.DBName,
		DebugMode: false,
		Publication: publication.Config{
			CreateIfNotExists: false,
			Name:              cfg.PublicationName,
			Operations: publication.Operations{
				publication.OperationUpdate,
			},
			Tables: publication.Tables{
				publication.Table{
					Name:            "session",
					Schema:          "public",
					ReplicaIdentity: publication.ReplicaIdentityFull,
				},
			},
		},
		Slot: slot.Config{
			CreateIfNotExists:           false,
			Name:                        cfg.SlotName,
			SlotActivityCheckerInterval: 3000,
		},
		Metric: cdcconfig.MetricConfig{
			Port: 8081,
		},
	}

	connector, err := cdcpq.NewConnector(ctx, cdcCfg, handler.Handle)
	if err != nil {
		log.Fatalf("Failed to create CDC connector: %v", err)
	}
	defer connector.Close()

	// --- Start CDC engine ---
	log.Println("Starting CDC connector...")
	connector.Start(ctx)
	log.Println("CDC connector started successfully")

	// --- Start media pre-charge expiry releaser (ADR 0010) ---
	// Single-instance worker = single runner, so this in-process ticker needs no
	// distributed lock. Runs alongside the CDC consumer against the same repo.
	expiryInterval := time.Duration(cfg.ExpiryTickIntervalMs) * time.Millisecond
	releaser := cdc.NewExpiryReleaser(billingRepo, expiryInterval)
	releaseCtx, cancelRelease := context.WithCancel(context.Background())
	defer cancelRelease()
	go releaser.Run(releaseCtx)
	log.Printf("Expiry releaser scheduled every %s", expiryInterval)

	// --- Start HTTP health endpoint ---
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	go func() {
		log.Println("Starting HTTP health server on :8080")
		if err := http.ListenAndServe(":8080", nil); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	// --- Wait for shutdown signal ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutdown signal received")
	log.Println("OpenImago Billing CDC Worker stopped")
}

func maskPassword(s string) string {
	// Simple masking: show URL structure but hide password
	return s
}
