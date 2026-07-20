package com.report.server;

import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.xml.XMLConstants;
import javax.xml.transform.dom.DOMSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import org.w3c.dom.Document;

/**
 * EtaxXmlValidator — validates e-Tax XML documents against bundled XSD schemas.
 *
 * <p>Schema files are stored in {@code classpath:schemas/e-tax/} and mapped by {@code
 * schemaVersion} string. The version key comes from {@link
 * com.report.server.FlatSubmissionModel#schemaVersion()}.
 *
 * <h3>Adding the official NTA XSD</h3>
 *
 * <ol>
 *   <li>Download the {@code .cab} from: {@code
 *       https://www.e-tax.nta.go.jp/shiyo/shiyo-withholding3.htm}
 *   <li>Extract the XSD (e.g. {@code PGE2025-231.xsd}).
 *   <li>Save it to: {@code server/src/main/resources/schemas/e-tax/withholding-tax-2025.xsd}
 *   <li>Add the mapping in {@link #SCHEMA_VERSIONS} below.
 * </ol>
 *
 * <h3>Security</h3>
 *
 * <ul>
 *   <li>External access (DTD, stylesheet) is disabled on the {@link SchemaFactory}.
 *   <li>Schemas are compiled once per version and cached in {@link #SCHEMA_CACHE}.
 * </ul>
 */
public final class EtaxXmlValidator {

    private EtaxXmlValidator() {}

    /** Maps schemaVersion value → classpath resource path under {@code schemas/e-tax/}. */
    private static final Map<String, String> SCHEMA_VERSIONS =
            Map.of(
                    "stub-1.0", "schemas/e-tax/withholding-tax-stub.xsd"
                    // To add 2025 official: "withholding-tax-2025",
                    // "schemas/e-tax/withholding-tax-2025.xsd"
                    );

    /** Compiled schemas cached by version key — thread-safe. */
    private static final ConcurrentHashMap<String, Schema> SCHEMA_CACHE = new ConcurrentHashMap<>();

    /**
     * Validate {@code doc} against the XSD for {@code schemaVersion}.
     *
     * @throws XmlValidationException if the document fails schema validation
     * @throws IllegalArgumentException if {@code schemaVersion} has no known XSD
     */
    public static void validate(Document doc, String schemaVersion) throws XmlValidationException {
        String resourcePath = SCHEMA_VERSIONS.get(schemaVersion);
        if (resourcePath == null) {
            throw new IllegalArgumentException(
                    "No XSD registered for schemaVersion '"
                            + schemaVersion
                            + "'. "
                            + "Add the mapping in EtaxXmlValidator.SCHEMA_VERSIONS.");
        }

        Schema schema = SCHEMA_CACHE.computeIfAbsent(schemaVersion, k -> loadSchema(resourcePath));

        try {
            Validator validator = schema.newValidator();
            // Disable external access on the validator as well
            validator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            validator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            validator.validate(new DOMSource(doc));
        } catch (org.xml.sax.SAXException e) {
            throw new XmlValidationException(schemaVersion, e.getMessage(), e);
        } catch (Exception e) {
            throw new XmlValidationException(
                    schemaVersion, "Validator error: " + e.getMessage(), e);
        }
    }

    private static Schema loadSchema(String resourcePath) {
        try {
            SchemaFactory sf = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
            sf.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            sf.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");

            InputStream is =
                    EtaxXmlValidator.class.getClassLoader().getResourceAsStream(resourcePath);
            if (is == null) {
                throw new IllegalStateException(
                        "XSD resource not found on classpath: " + resourcePath);
            }
            try (is) {
                return sf.newSchema(new javax.xml.transform.stream.StreamSource(is));
            }
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load XSD: " + resourcePath, e);
        }
    }
}
