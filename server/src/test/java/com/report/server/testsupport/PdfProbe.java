package com.report.server.testsupport;

import com.report.server.pdf.SectionRenderHelper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Parse-back probe for rendered PDFs (issue #59: golden PDF regression tests).
 *
 * <p>Parses a PDF byte array eagerly into page sizes, per-page extracted text,
 * and positioned text runs, so tests can assert on <em>content</em> rather
 * than just "a PDF was produced".
 *
 * <p>Coordinates are exposed in millimetres with a top-left origin, matching
 * the designer's element model. Note that the renderer converts mm→pt with
 * {@link SectionRenderHelper#MM_TO_PT} (2.835) while this probe converts
 * pt→mm with the exact factor, so round-tripped positions carry a ~0.02%
 * systematic offset — use tolerances of ±0.5mm.
 *
 * <p>Extracted text is NFKC-normalized: the Noto subset font's ToUnicode CMap
 * maps some ideographs to Kangxi-radical codepoints (見→⾒, 金→⾦, 日→⽇, …);
 * NFKC folds them back so tests can assert against natural Japanese strings.
 */
public final class PdfProbe {

    /** Exact pt→mm conversion (1pt = 1/72 inch). */
    public static final float PT_TO_MM = 25.4f / 72f;

    /** The renderer's mm→pt factor — kept in sync with production code. */
    public static final float RENDERER_MM_TO_PT = SectionRenderHelper.MM_TO_PT;

    /**
     * One extracted text run.
     *
     * @param pageIndex   zero-based page index
     * @param text        the run's text as extracted (requires ToUnicode CMap)
     * @param xMm         left edge of the first glyph, mm from page left
     * @param baselineYMm text baseline, mm from page top
     * @param fontSizePt  font size in points
     * @param fontName    PDF font name (subset fonts look like "ABCDEF+NotoSansJP-Regular")
     */
    public record TextRun(int pageIndex, String text, float xMm, float baselineYMm,
                          float fontSizePt, String fontName) {}

    private final int pageCount;
    private final List<float[]> pageSizesMm;
    private final List<String> pageTexts;
    private final List<TextRun> runs;

    private PdfProbe(int pageCount, List<float[]> pageSizesMm,
                     List<String> pageTexts, List<TextRun> runs) {
        this.pageCount = pageCount;
        this.pageSizesMm = pageSizesMm;
        this.pageTexts = pageTexts;
        this.runs = runs;
    }

    /** Parse PDF bytes into an immutable probe. The document is closed before returning. */
    public static PdfProbe parse(byte[] pdfBytes) throws IOException {
        List<float[]> sizes = new ArrayList<>();
        List<String> texts = new ArrayList<>();
        List<TextRun> runs = new ArrayList<>();

        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            int pages = doc.getNumberOfPages();
            for (int i = 0; i < pages; i++) {
                PDRectangle box = doc.getPage(i).getMediaBox();
                sizes.add(new float[]{box.getWidth() * PT_TO_MM, box.getHeight() * PT_TO_MM});
            }

            PDFTextStripper stripper = new PDFTextStripper() {
                @Override
                protected void writeString(String string, List<TextPosition> positions) throws IOException {
                    if (!positions.isEmpty()) {
                        TextPosition first = positions.get(0);
                        String fontName = first.getFont() != null && first.getFont().getName() != null
                                ? first.getFont().getName() : "";
                        runs.add(new TextRun(getCurrentPageNo() - 1,
                                Normalizer.normalize(string, Normalizer.Form.NFKC),
                                first.getXDirAdj() * PT_TO_MM,
                                first.getYDirAdj() * PT_TO_MM,
                                first.getFontSizeInPt(),
                                fontName));
                    }
                    super.writeString(string, positions);
                }
            };
            stripper.setSortByPosition(true);
            for (int i = 1; i <= pages; i++) {
                stripper.setStartPage(i);
                stripper.setEndPage(i);
                texts.add(Normalizer.normalize(stripper.getText(doc), Normalizer.Form.NFKC));
            }
            return new PdfProbe(pages, sizes, texts, runs);
        }
    }

    // ── Page-level accessors ────────────────────────────────────────────

    public int pageCount() {
        return pageCount;
    }

    public float pageWidthMm(int pageIndex) {
        return pageSizesMm.get(pageIndex)[0];
    }

    public float pageHeightMm(int pageIndex) {
        return pageSizesMm.get(pageIndex)[1];
    }

    /** Full extracted text of one page (zero-based). */
    public String pageText(int pageIndex) {
        return pageTexts.get(pageIndex);
    }

    /** Extracted text of all pages concatenated. */
    public String allText() {
        return String.join("\n", pageTexts);
    }

    public boolean pageContains(int pageIndex, String needle) {
        return pageText(pageIndex).contains(needle);
    }

    // ── Text-run accessors ──────────────────────────────────────────────

    public List<TextRun> runs() {
        return runs;
    }

    public List<TextRun> runs(int pageIndex) {
        return runs.stream().filter(r -> r.pageIndex() == pageIndex).toList();
    }

    /** First run on the page whose text contains {@code needle}. */
    public Optional<TextRun> findRun(int pageIndex, String needle) {
        return runs(pageIndex).stream().filter(r -> r.text().contains(needle)).findFirst();
    }

    /** All runs (any page) whose text contains {@code needle}. */
    public List<TextRun> findRuns(String needle) {
        return runs.stream().filter(r -> r.text().contains(needle)).toList();
    }

    // ── Expected-position helpers (renderer coordinate contract) ───────

    /**
     * Expected baseline Y (mm from top) for a text element whose frame top is
     * {@code elementTopMm}: TextPdfRenderer draws the baseline one font-size
     * below the frame top.
     */
    public static float expectedBaselineYMm(float elementTopMm, float fontSizePt) {
        return (elementTopMm * RENDERER_MM_TO_PT + fontSizePt) * PT_TO_MM;
    }

    /** Expected X (mm from left) for a design-space X in mm. */
    public static float expectedXMm(float designXMm) {
        return designXMm * RENDERER_MM_TO_PT * PT_TO_MM;
    }

    /** Human-readable dump of all runs — debugging aid for writing assertions. */
    public String dumpRuns() {
        StringBuilder sb = new StringBuilder();
        for (TextRun r : runs) {
            sb.append(String.format("p%d (%.1f, %.1f) %.1fpt [%s] %s%n",
                    r.pageIndex(), r.xMm(), r.baselineYMm(), r.fontSizePt(), r.fontName(), r.text()));
        }
        return sb.toString();
    }
}
