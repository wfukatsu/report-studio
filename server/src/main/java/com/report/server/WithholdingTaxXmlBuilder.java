package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayOutputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * WithholdingTaxXmlBuilder — builds e-Tax XML for 源泉徴収票 (Withholding Tax Slip).
 *
 * <p>Security requirements enforced here:
 *
 * <ul>
 *   <li>DOCTYPE declarations are disallowed (XXE prevention)
 *   <li>External entity resolution is disabled
 *   <li>All field values are set via DOM {@code setTextContent()} — never string concatenation
 * </ul>
 *
 * <p>Phase 4: source is withholding tax only. A second form type triggers abstraction (YAGNI).
 */
public final class WithholdingTaxXmlBuilder {

    private WithholdingTaxXmlBuilder() {}

    /**
     * Build a withholding tax XML document from a projection and form data.
     *
     * @param projection the template projection JSON (may contain binding refs)
     * @param formData flat form data (may be null — empty strings used for all fields)
     * @return an XXE-safe DOM Document
     */
    public static Document build(JsonNode projection, JsonNode formData) throws Exception {
        DocumentBuilderFactory dbf = createSecureDocumentBuilderFactory();
        Document doc = dbf.newDocumentBuilder().newDocument();

        Element root = doc.createElement("SalaryIncomeTaxWithholdingSlip");
        doc.appendChild(root);

        appendPayer(doc, root, formData);
        appendPayee(doc, root, formData);
        appendAmounts(doc, root, formData);

        return doc;
    }

    /**
     * Build and validate against the named XSD schema version.
     *
     * <p>Use {@code "stub-1.0"} for the bundled stub. When the official NTA XSD is registered in
     * {@link EtaxXmlValidator}, pass the corresponding version key.
     *
     * @throws XmlValidationException if the generated XML does not conform to the schema
     */
    public static Document buildAndValidate(
            JsonNode projection, JsonNode formData, String schemaVersion) throws Exception {
        Document doc = build(projection, formData);
        EtaxXmlValidator.validate(doc, schemaVersion);
        return doc;
    }

    /** Serialize a Document to UTF-8 XML bytes. */
    public static byte[] toXmlBytes(Document doc) throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        // Prevent SSRF via transformer external access
        tf.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        tf.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty(OutputKeys.STANDALONE, "yes");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        transformer.transform(new DOMSource(doc), new StreamResult(out));
        return out.toByteArray();
    }

    // ── Payer block ───────────────────────────────────────────────────────────

    private static void appendPayer(Document doc, Element root, JsonNode fd) {
        Element payer = doc.createElement("Payer");
        appendElement(doc, payer, "PayerName", fieldOf(fd, "payerName"));
        appendElement(doc, payer, "PayerAddress", fieldOf(fd, "payerAddress"));
        appendElement(doc, payer, "PayerPhone", fieldOf(fd, "payerPhone"));
        appendElement(doc, payer, "PayerNumber", fieldOf(fd, "payerNumber"));
        root.appendChild(payer);
    }

    // ── Payee block ───────────────────────────────────────────────────────────

    private static void appendPayee(Document doc, Element root, JsonNode fd) {
        Element payee = doc.createElement("Payee");
        appendElement(doc, payee, "PayeeName", fieldOf(fd, "payeeName"));
        appendElement(doc, payee, "PayeeAddress", fieldOf(fd, "payeeAddress"));
        appendElement(doc, payee, "PayeeMyNumber", fieldOf(fd, "payeeMyNumber"));
        appendElement(doc, payee, "PayeeCategory", fieldOf(fd, "payeeCategory"));
        root.appendChild(payee);
    }

    // ── Amounts block ─────────────────────────────────────────────────────────

    private static void appendAmounts(Document doc, Element root, JsonNode fd) {
        Element amounts = doc.createElement("Amounts");
        appendElement(doc, amounts, "SalaryAmount", fieldOf(fd, "salaryAmount"));
        appendElement(doc, amounts, "WithholdingTax", fieldOf(fd, "withholdingTax"));
        appendElement(doc, amounts, "SocialInsurance", fieldOf(fd, "socialInsurance"));
        appendElement(doc, amounts, "LifeInsurance", fieldOf(fd, "lifeInsurance"));
        appendElement(doc, amounts, "EarthquakeInsurance", fieldOf(fd, "earthquakeInsurance"));
        appendElement(doc, amounts, "Dependents", fieldOf(fd, "dependents"));
        appendElement(doc, amounts, "PaymentYear", fieldOf(fd, "paymentYear"));
        root.appendChild(amounts);
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    /**
     * Append a child element with the given text content. Uses DOM {@code setTextContent()} so the
     * DOM serializer handles all escaping — {@code <}, {@code >}, {@code &} are never injectable
     * through this path.
     */
    private static void appendElement(Document doc, Element parent, String tagName, String value) {
        Element el = doc.createElement(tagName);
        el.setTextContent(value); // DOM escapes < > & automatically — no string concatenation
        parent.appendChild(el);
    }

    /** Resolve a field value from form data. Returns empty string if absent or null. */
    private static String fieldOf(JsonNode formData, String key) {
        if (formData == null || formData.isMissingNode()) return "";
        JsonNode val = formData.get(key);
        return (val != null && !val.isNull()) ? val.asText("") : "";
    }

    // ── Security factory ──────────────────────────────────────────────────────

    /**
     * Create a DocumentBuilderFactory with all external entity / DOCTYPE features disabled. This
     * prevents XXE (XML External Entity) attacks.
     */
    private static DocumentBuilderFactory createSecureDocumentBuilderFactory() throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();

        // Disallow DOCTYPE declarations entirely
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);

        // Disable external general and parameter entities
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

        // Disable XInclude and entity reference expansion
        dbf.setXIncludeAware(false);
        dbf.setExpandEntityReferences(false);

        return dbf;
    }
}
