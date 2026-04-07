package com.report.server;

import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class PdfRendererTest {

    @Test
    void render_emptyProjection() throws IOException {
        byte[] pdf = PdfRenderer.render("{\"templates\":[]}");
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        // PDF magic bytes: %PDF
        assertEquals('%', (char) pdf[0]);
        assertEquals('P', (char) pdf[1]);
        assertEquals('D', (char) pdf[2]);
        assertEquals('F', (char) pdf[3]);
    }

    @Test
    void render_templateWithTextElement() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Test",
              "pageSetup":{"kind":"preset","paperSizeId":"A4","orientation":"portrait"},
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"Hello",
                  "frame":{"x":50,"y":30,"width":200,"height":30,"rotation":0},
                  "props":{"text":"Hello World","fontSize":16}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_templateWithShapes() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Shapes",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[
                  {"id":"e1","kind":"shape","name":"Rect","frame":{"x":50,"y":50,"width":100,"height":60,"rotation":0},"props":{"shapeType":"rectangle"}},
                  {"id":"e2","kind":"shape","name":"Ellipse","frame":{"x":200,"y":50,"width":80,"height":80,"rotation":0},"props":{"shapeType":"ellipse"}}
                ]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_templateWithBarcode() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Barcode",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"barcode","name":"BC",
                  "frame":{"x":50,"y":50,"width":150,"height":60,"rotation":0},
                  "props":{"value":"1234567890","format":"CODE128"}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_templateWithQrCode() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"QR",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"qrcode","name":"QR",
                  "frame":{"x":50,"y":50,"width":60,"height":60,"rotation":0},
                  "props":{"value":"https://example.com"}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_landscapeOrientation() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Landscape",
              "pageSetup":{"kind":"preset","paperSizeId":"A4","orientation":"landscape"},
              "sections":[]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 0);
    }

    @Test
    void render_customPageSize() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Custom",
              "pageSetup":{"kind":"custom","customWidthMm":100,"customHeightMm":150,"orientation":"portrait"},
              "sections":[]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 0);
    }

    @Test
    void render_lineElement() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Line",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"line","name":"Divider",
                  "frame":{"x":20,"y":100,"width":170,"height":0,"rotation":0},
                  "props":{}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_unknownElementKind() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Unknown",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"future_element","name":"Future",
                  "frame":{"x":50,"y":50,"width":100,"height":50,"rotation":0},
                  "props":{}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_relativeSectionLayout_absoluteElementsUnchanged() throws IOException {
        // page_base with layoutMode: relative but no anchorTo — elements keep original positions
        String json = """
            {"templates":[{
              "id":"t1","name":"Relative",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "layoutMode":"relative",
                "elements":[
                  {"id":"e1","kind":"text","name":"Title",
                   "frame":{"x":10,"y":10,"width":180,"height":10,"rotation":0},
                   "props":{"text":"Title"}},
                  {"id":"e2","kind":"text","name":"Body",
                   "frame":{"x":10,"y":30,"width":180,"height":20,"rotation":0},
                   "props":{"text":"Body"}}
                ]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_relativeSectionLayout_pushDownElement() throws IOException {
        // Element e2 anchors to e1 with pushDown — Y is computed from e1's bottom
        String json = """
            {"templates":[{
              "id":"t1","name":"RelativePushDown",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "layoutMode":"relative",
                "elements":[
                  {"id":"e1","kind":"text","name":"Title",
                   "frame":{"x":10,"y":10,"width":180,"height":20,"rotation":0},
                   "props":{"text":"Dynamic Title"}},
                  {"id":"e2","kind":"text","name":"Body",
                   "frame":{"x":10,"y":35,"width":180,"height":10,"rotation":0},
                   "props":{"text":"Body","layout":{"anchorTo":"e1","pushDown":true}}}
                ]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_unknownSectionType_fallsBackGracefully() throws IOException {
        // Unknown section types must not crash — graceful fallback (todo-066 requirement)
        String json = """
            {"templates":[{
              "id":"t1","name":"UnknownSection",
              "sections":[{
                "id":"s1","type":"future_section_type","name":"Future","y":0,"height":100,
                "elements":[{
                  "id":"e1","kind":"text","name":"Hi",
                  "frame":{"x":10,"y":10,"width":100,"height":20,"rotation":0},
                  "props":{"text":"fallback"}
                }]
              }]
            }]}""";
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
    }

    @Test
    void render_multiRowTableSection_singlePage() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"MultiRow",
              "sections":[{
                "id":"s1","type":"multi_row_table","name":"MultiRow",
                "y":0,"height":200,"rowUnitSize":2,"splitPolicy":"forbidden",
                "elements":[{
                  "id":"e1","kind":"text","name":"Header",
                  "frame":{"x":10,"y":10,"width":190,"height":10,"rotation":0},
                  "props":{"text":"Item"}
                }]
              }]
            }],
            "_formData":{"items":[{"name":"A"},{"name":"B"}]}}""";
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_multiRowTableSection_withFormDataRows() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"MultiRowWithData",
              "sections":[
                {"id":"header","type":"page_base","name":"Header","y":0,"height":30,
                 "elements":[{"id":"h1","kind":"text","name":"Title",
                   "frame":{"x":10,"y":10,"width":180,"height":10,"rotation":0},
                   "props":{"text":"Report Title"}}]},
                {"id":"body","type":"multi_row_table","name":"Body",
                 "y":30,"height":240,"rowUnitSize":2,"splitPolicy":"allowed-between-rows",
                 "elements":[
                   {"id":"row1","kind":"row_block","name":"Row1",
                    "frame":{"x":10,"y":0,"width":190,"height":20,"rotation":0},
                    "bindingRef":"items[].name","props":{}},
                   {"id":"row2","kind":"row_block","name":"Row2",
                    "frame":{"x":10,"y":20,"width":190,"height":20,"rotation":0},
                    "bindingRef":"items[].description","props":{}}
                 ]}
              ]
            }],
            "_formData":{"items":[
              {"name":"Item A","description":"Desc A"},
              {"name":"Item B","description":"Desc B"},
              {"name":"Item C","description":"Desc C"}
            ]}}""";
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }
}
