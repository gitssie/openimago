package com.openimago.billingcdc.handler;

import com.openimago.billingcdc.handler.models.BillingEvent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link BillingEvent} model and event parsing.
 */
class SessionChangeHandlerTest {

    private static final ObjectMapper mapper = new ObjectMapper();

    @Test
    @DisplayName("should build uniqueness key correctly")
    void shouldBuildUniquenessKeyCorrectly() {
        ObjectNode before = mapper.createObjectNode().put("id", "ses_001").put("cost", 1.0);
        ObjectNode after  = mapper.createObjectNode().put("id", "ses_001").put("cost", 2.0);

        BillingEvent event = new BillingEvent(
                "0/16B3748", 570L, "public.session", "u", "ses_001", before, after
        );

        assertThat(event.uniquenessKey()).isEqualTo(
                "0/16B3748::570::public.session::u::ses_001"
        );
        assertThat(event.isUpdate()).isTrue();
        assertThat(event.isInsert()).isFalse();
        assertThat(event.isDelete()).isFalse();
    }

    @Test
    @DisplayName("should detect insert and delete operations")
    void shouldDetectInsertAndDeleteOperations() {
        ObjectNode after = mapper.createObjectNode().put("id", "ses_002").put("cost", 5.0);
        ObjectNode before = mapper.createObjectNode().put("id", "ses_002").put("cost", 5.0);

        BillingEvent insertEvent = new BillingEvent(
                "0/ABC", 1L, "public.session", "c", "ses_002", null, after
        );
        assertThat(insertEvent.isInsert()).isTrue();
        assertThat(insertEvent.isUpdate()).isFalse();
        assertThat(insertEvent.isDelete()).isFalse();

        BillingEvent deleteEvent = new BillingEvent(
                "0/DEF", 1L, "public.session", "d", "ses_002", before, null
        );
        assertThat(deleteEvent.isDelete()).isTrue();
        assertThat(deleteEvent.isInsert()).isFalse();
        assertThat(deleteEvent.isUpdate()).isFalse();
    }
}
