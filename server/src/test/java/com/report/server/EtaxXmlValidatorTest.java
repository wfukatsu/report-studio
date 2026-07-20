package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;

/**
 * Integration tests for EtaxXmlValidator — verifies the XSD validation pipeline from
 * WithholdingTaxXmlBuilder output against the bundled stub XSD.
 */
class EtaxXmlValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ObjectNode buildFormData() {
        ObjectNode fd = MAPPER.createObjectNode();
        fd.put("payerName", "株式会社サンプル");
        fd.put("payerAddress", "東京都千代田区1-1-1");
        fd.put("payerPhone", "03-1234-5678");
        fd.put("payerNumber", "1234567890123");
        fd.put("payeeName", "山田 太郎");
        fd.put("payeeAddress", "東京都新宿区2-2-2");
        fd.put("payeeMyNumber", "9876543210987");
        fd.put("payeeCategory", "甲");
        fd.put("salaryAmount", "5000000");
        fd.put("withholdingTax", "250000");
        fd.put("socialInsurance", "750000");
        fd.put("lifeInsurance", "50000");
        fd.put("earthquakeInsurance", "10000");
        fd.put("dependents", "2");
        fd.put("paymentYear", "2025");
        return fd;
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    @Test
    void buildAndValidate_validFormData_passesXsd() throws Exception {
        ObjectNode fd = buildFormData();
        Document doc = WithholdingTaxXmlBuilder.buildAndValidate(null, fd, "stub-1.0");
        assertNotNull(doc);
        assertEquals("SalaryIncomeTaxWithholdingSlip", doc.getDocumentElement().getTagName());
    }

    @Test
    void buildAndValidate_emptyFormData_passesXsd() throws Exception {
        // Empty form data produces empty string fields — still valid against stub XSD
        Document doc = WithholdingTaxXmlBuilder.buildAndValidate(null, null, "stub-1.0");
        assertNotNull(doc);
    }

    @Test
    void validate_unknownSchemaVersion_throwsIllegalArgument() throws Exception {
        Document doc = WithholdingTaxXmlBuilder.build(null, buildFormData());
        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> EtaxXmlValidator.validate(doc, "unknown-version"));
        assertTrue(ex.getMessage().contains("No XSD registered"));
    }

    @Test
    void toXmlBytes_containsExpectedElements() throws Exception {
        ObjectNode fd = buildFormData();
        Document doc = WithholdingTaxXmlBuilder.build(null, fd);
        byte[] xml = WithholdingTaxXmlBuilder.toXmlBytes(doc);
        String xmlStr = new String(xml, java.nio.charset.StandardCharsets.UTF_8);

        assertTrue(xmlStr.contains("<SalaryIncomeTaxWithholdingSlip>"));
        assertTrue(xmlStr.contains("<PayerName>株式会社サンプル</PayerName>"));
        assertTrue(xmlStr.contains("<PayeeName>山田 太郎</PayeeName>"));
        assertTrue(xmlStr.contains("<SalaryAmount>5000000</SalaryAmount>"));
    }

    @Test
    void toXmlBytes_xssEscaped() throws Exception {
        ObjectNode fd = buildFormData();
        fd.put("payerName", "<script>alert('xss')</script>");
        Document doc = WithholdingTaxXmlBuilder.build(null, fd);
        byte[] xml = WithholdingTaxXmlBuilder.toXmlBytes(doc);
        String xmlStr = new String(xml, java.nio.charset.StandardCharsets.UTF_8);

        // DOM serializer must escape < and > — raw script tag must NOT appear
        assertFalse(xmlStr.contains("<script>"), "Raw <script> tag must not appear in XML output");
        assertTrue(xmlStr.contains("&lt;script&gt;") || xmlStr.contains("&lt;script"));
    }
}
