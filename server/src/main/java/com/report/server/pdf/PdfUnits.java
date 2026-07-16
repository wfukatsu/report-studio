package com.report.server.pdf;

/**
 * Canonical unit-conversion constants for the PDF engine (issue #57).
 *
 * <p>1 pt = 1/72 inch, 1 inch = 25.4 mm → 1 mm = 72/25.4 pt (≈ 2.8346457).
 * Previously the rounded literal {@code 2.835f} was duplicated across four
 * renderer classes, accumulating ~0.5 mm of drift across an A4 width; every
 * mm→pt conversion must go through these constants instead.
 */
public final class PdfUnits {

    /** Exact mm→pt factor. */
    public static final double MM_TO_PT_EXACT = 72.0 / 25.4;

    /** Float convenience for the float-based PDFBox pipeline. */
    public static final float MM_TO_PT = (float) MM_TO_PT_EXACT;

    private PdfUnits() {}
}
