plugins {
    java
    application
    jacoco
    id("com.diffplug.spotless") version "7.0.2"
}

group = "com.report"
version = "0.1.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Web framework
    implementation("io.javalin:javalin:7.2.2")

    // JSON
    implementation("com.fasterxml.jackson.core:jackson-databind:2.22.1")

    // ScalarDB
    // Pinned to 3.14.4 — contains a JDBC storage connection leak fix that matters
    // under the catalog-listing workload introduced by V2ScalarDbCatalogController.
    // See docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md (Risks table).
    implementation("com.scalar-labs:scalardb:3.14.4")

    // SQLite JDBC (ScalarDB storage backend)
    implementation("org.xerial:sqlite-jdbc:3.53.2.0")

    // PDF generation
    implementation("org.apache.pdfbox:pdfbox:3.0.8")

    // Barcode/QR generation for PDF
    implementation("com.google.zxing:core:3.5.4")
    implementation("com.google.zxing:javase:3.5.4")

    // Password hashing
    implementation("at.favre.lib:bcrypt:0.10.2")

    // RE2J — linear-time regex engine (ReDoS-safe pattern validation)
    implementation("com.google.re2j:re2j:1.8")

    // Apache Commons JEXL 3.x — sandboxed expression engine for CalculationRule / ValidationRule conditions
    implementation("org.apache.commons:commons-jexl3:3.7.0")

    // Apache POI — Excel export (SXSSF streaming workbook)
    implementation("org.apache.poi:poi-ooxml:5.5.1")

    // Logging
    implementation("org.slf4j:slf4j-simple:2.0.18")

    // Test
    testImplementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.22.1")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testImplementation("org.mockito:mockito-core:5.14.2")
    testImplementation("io.javalin:javalin-testtools:7.2.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass.set("com.report.server.App")
}

tasks.named<JavaExec>("run") {
    workingDir = rootProject.projectDir
}

tasks.register<JavaExec>("seed") {
    description = "Seed the database with sample tables and data"
    mainClass.set("com.report.server.SeedData")
    classpath = sourceSets["main"].runtimeClasspath
    workingDir = rootProject.projectDir
}

// Bundle the shared ReportDefinition limits (single source at ../schemas)
// into resources so ReportDefinitionValidator reads the same file as the
// frontend Zod schema (issue #52).
tasks.processResources {
    from(project.projectDir.resolve("../schemas")) {
        include("report-definition-limits.json")
    }
}

spotless {
    java {
        target("src/**/*.java")
        googleJavaFormat("1.25.2").aosp()
        removeUnusedImports()
    }
}

tasks.test {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}
