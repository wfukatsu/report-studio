package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;

class WithholdingTaxXmlBuilderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode parse(String json) {
        try { return MAPPER.readTree(json); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    private String toXmlString(Document doc) throws Exception {
        Transformer t = TransformerFactory.newInstance().newTransformer();
        t.setOutputProperty(OutputKeys.INDENT, "no");
        StringWriter sw = new StringWriter();
        t.transform(new DOMSource(doc), new StreamResult(sw));
        return sw.toString();
    }

    // ── Basic structure ───────────────────────────────────────────────────────

    @Test
    void build_producesDocumentWithRootElement() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("{\"payerName\":\"テスト株式会社\",\"payeeName\":\"田中太郎\"}");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        assertNotNull(doc);
        assertNotNull(doc.getDocumentElement());
        assertEquals("SalaryIncomeTaxWithholdingSlip", doc.getDocumentElement().getTagName());
    }

    @Test
    void build_payerBlock_populatedFromFormData() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("""
            {
              "payerName": "テスト株式会社",
              "payerAddress": "東京都千代田区1-1-1",
              "payerPhone": "03-1234-5678"
            }""");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        NodeList payerName = doc.getElementsByTagName("PayerName");
        assertEquals(1, payerName.getLength());
        assertEquals("テスト株式会社", payerName.item(0).getTextContent());
    }

    @Test
    void build_payeeBlock_populatedFromFormData() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("""
            {
              "payeeName": "田中太郎",
              "payeeAddress": "大阪府大阪市北区1-2-3",
              "payeeMyNumber": "123456789012"
            }""");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        NodeList payeeName = doc.getElementsByTagName("PayeeName");
        assertEquals(1, payeeName.getLength());
        assertEquals("田中太郎", payeeName.item(0).getTextContent());
    }

    @Test
    void build_amounts_populatedFromFormData() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("""
            {
              "salaryAmount": "5000000",
              "withholdingTax": "450000",
              "socialInsurance": "750000"
            }""");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        NodeList salary = doc.getElementsByTagName("SalaryAmount");
        assertEquals(1, salary.getLength());
        assertEquals("5000000", salary.item(0).getTextContent());
    }

    // ── XML injection prevention ──────────────────────────────────────────────

    @Test
    void build_xmlSpecialChars_areEscaped() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("""
            {
              "payerName": "<script>alert('xss')</script>",
              "payeeName": "O'Reilly & Sons"
            }""");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        String xml = toXmlString(doc);

        // DOM serializer escapes < > & — raw script tag must not appear
        assertFalse(xml.contains("<script>"));
        // The name should appear escaped or as text content (DOM handles it)
        NodeList payerName = doc.getElementsByTagName("PayerName");
        assertEquals("<script>alert('xss')</script>", payerName.item(0).getTextContent());
    }

    @Test
    void build_xmlInjectionAttempt_safeViaDOM() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        // Attempt XML injection via closing tag
        JsonNode formData = parse("{\"payerName\": \"evil</PayerName><injected>hack\"}");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        // DOM setTextContent prevents injection — injected element must not exist
        NodeList injected = doc.getElementsByTagName("injected");
        assertEquals(0, injected.getLength());
    }

    // ── XXE prevention ────────────────────────────────────────────────────────

    @Test
    void build_xxeProtection_docTypeDisallowed() throws Exception {
        // Verify the builder does not allow DOCTYPE declarations
        // (build() should complete without attempting external entity resolution)
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("{}");

        // This should succeed and return a document with XXE protections enabled
        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        assertNotNull(doc);
        // Document must not have a DOCTYPE
        assertNull(doc.getDoctype());
    }

    // ── Missing / null form data ──────────────────────────────────────────────

    @Test
    void build_emptyFormData_producesDocumentWithEmptyFields() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("{}");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        assertNotNull(doc);
        // All fields exist but are empty strings
        NodeList payerName = doc.getElementsByTagName("PayerName");
        assertEquals(1, payerName.getLength());
        assertEquals("", payerName.item(0).getTextContent());
    }

    @Test
    void build_nullFormData_doesNotThrow() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        assertDoesNotThrow(() -> WithholdingTaxXmlBuilder.build(projection, null));
    }

    // ── toXmlBytes ────────────────────────────────────────────────────────────

    @Test
    void toXmlBytes_producesValidXmlBytes() throws Exception {
        JsonNode projection = parse("{\"templates\":[{\"id\":\"t1\",\"sections\":[]}]}");
        JsonNode formData = parse("{\"payerName\":\"テスト\"}");

        byte[] bytes = WithholdingTaxXmlBuilder.toXmlBytes(
                WithholdingTaxXmlBuilder.build(projection, formData));
        assertNotNull(bytes);
        assertTrue(bytes.length > 0);
        String xml = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(xml.contains("SalaryIncomeTaxWithholdingSlip"));
    }

    // ── Field extraction from projection ─────────────────────────────────────

    @Test
    void build_withProjectionBindings_usesFormDataValues() throws Exception {
        // Projection contains elements with bindingRef — formData should fill those values
        JsonNode projection = parse("""
            {"templates":[{"id":"t1","sections":[{
              "id":"s1","type":"page_base","elements":[
                {"id":"e1","kind":"text","bindingRef":"payerName",
                 "frame":{"x":0,"y":0,"width":100,"height":10,"rotation":0},"props":{}}
              ]}]}]}""");
        JsonNode formData = parse("{\"payerName\":\"テスト株式会社\",\"payeeName\":\"山田花子\"}");

        Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
        NodeList payer = doc.getElementsByTagName("PayerName");
        assertEquals("テスト株式会社", payer.item(0).getTextContent());
    }
}
