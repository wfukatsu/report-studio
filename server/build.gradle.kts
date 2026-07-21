plugins {
    java
    application
    jacoco
    id("com.diffplug.spotless") version "8.8.0"
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
    // 3.17.3 — supersedes the 3.14.4 pin (the JDBC storage connection leak fix that
    // mattered under the catalog-listing workload of ScalarDbCatalogController is
    // included in all 3.15+ releases).
    // See docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md (Risks table).
    implementation("com.scalar-labs:scalardb:3.18.0")

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

    // Logging (#274): logback with pattern console output by default; LOG_FORMAT=json
    // switches to logstash JSON encoding. The <if> conditional in logback.xml needs
    // janino at runtime — smallest working combination for an optional JSON mode.
    implementation("ch.qos.logback:logback-classic:1.5.38")
    implementation("net.logstash.logback:logstash-logback-encoder:8.1")
    runtimeOnly("org.codehaus.janino:janino:3.1.12")

    // Test
    testImplementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.22.1")
    testImplementation("org.junit.jupiter:junit-jupiter:6.1.2")
    testImplementation("org.mockito:mockito-core:5.23.0")
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
        googleJavaFormat("1.35.0").aosp()
        removeUnusedImports()
    }
}

// Compiler lint for main + test compilation (#266). Deprecation warnings exist
// today (ScalarDB/Javalin API churn), so warnings stay visible but are not
// errors (-Werror intentionally omitted).
tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.add("-Xlint:all,-processing")
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

// Coverage ratchet (#266): thresholds are set just below the measured overall
// coverage at the time of introduction (instruction 64.8%, branch 58.8% —
// rounded down to the nearest whole percent). Raise them as coverage grows;
// never lower them to admit a regression.
tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        rule {
            limit {
                counter = "INSTRUCTION"
                value = "COVEREDRATIO"
                minimum = "0.64".toBigDecimal()
            }
        }
        rule {
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = "0.58".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}
