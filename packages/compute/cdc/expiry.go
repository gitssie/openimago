package cdc

import (
	"context"
	"log"
	"time"

	"github.com/openimago/billing-cdc-worker/repository"
)

// ExpiryReleaser periodically releases expired, unconfirmed media pre-charges
// (ADR 0010 expiry safety net).
//
// The billing-cdc-worker is a single-instance background service, so a single
// in-process ticker is the single runner — no distributed lock is required.
type ExpiryReleaser struct {
	repo     *repository.BillingRepository
	interval time.Duration
}

// NewExpiryReleaser creates a releaser that ticks every interval.
func NewExpiryReleaser(repo *repository.BillingRepository, interval time.Duration) *ExpiryReleaser {
	return &ExpiryReleaser{repo: repo, interval: interval}
}

// Run starts the ticker loop and blocks until ctx is cancelled. Intended to run
// in its own goroutine alongside the CDC connector.
func (e *ExpiryReleaser) Run(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	log.Printf("Expiry releaser started (interval=%s)", e.interval)
	for {
		select {
		case <-ctx.Done():
			log.Println("Expiry releaser stopped")
			return
		case <-ticker.C:
			e.tick()
		}
	}
}

// tick runs one release pass and logs each released pre-charge.
func (e *ExpiryReleaser) tick() {
	released, err := e.repo.ReleaseExpiredPrecharges()
	if err != nil {
		log.Printf("ERROR: expiry release tick failed: %v", err)
	}
	for _, r := range released {
		log.Printf("Released expired media pre-charge: charge_source_id=%s account=%s user=%s refund_micros=%d",
			r.ChargeSourceID, r.AccountID, r.UserID, r.RefundMicros)
	}
}
