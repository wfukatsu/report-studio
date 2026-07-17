package com.report.server;

import com.report.server.auth.AdminUserController;
import com.report.server.auth.AuthController;
import com.report.server.auth.FormSessionManager;
import com.report.server.auth.RateLimiter;
import com.report.server.auth.UserRepository;
import com.report.server.job.BatchPdfProcessor;
import com.report.server.job.JobController;
import com.report.server.job.JobRepository;
import com.scalar.db.service.TransactionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Wires all repositories and controllers together.
 * Owns the lifecycle of shared ExecutorService instances.
 */
public final class AppWiring {

    private static final Logger log = LoggerFactory.getLogger(AppWiring.class);
    private static final String NAMESPACE = "report_studio";

    // ── Repositories ──────────────────────────────────────────────────────────
    final ProjectionRepository projRepo;
    final JsonBlobRepository schemaRepo;
    final JsonBlobRepository bindingTreeRepo;
    final JsonBlobRepository responseRepo;
    final TemplateListRepository templateList;
    final JobRepository jobRepo;
    final VersionRepository versionRepo;

    // ── V2 repositories and controllers ───────────────────────────────────────
    final JsonBlobRepository v2DefinitionsRepo;
    final JsonBlobRepository v2ResponseRepo;
    final V2TemplateController v2TemplateCtrl;
    final SchemaLibraryController schemaLibraryCtrl;
    final V2EvaluateController v2EvalCtrl;
    final V2VersionController v2VersionCtrl;
    final V2FormResponseController v2FormResponseCtrl;
    final V2ResponseExportController v2ResponseExportCtrl;
    final V2ResponsePdfController v2ResponsePdfCtrl;
    final V2PdfController v2PdfCtrl;
    final V2TemplateExportController v2ExportCtrl;
    final V2ThumbnailController v2ThumbnailCtrl;
    final V2SchemaInferController v2SchemaInferCtrl;
    final V2PdfJobController v2PdfJobCtrl;
    final V2StatelessPdfController v2StatelessPdfCtrl;
    final V2ScalarDbCatalogController v2ScalarDbCatalogCtrl;
    final V2ScalarDbTableController v2ScalarDbTableCtrl;
    final V2BindingResolveController v2BindingResolveCtrl;
    final JsonBlobRepository tenantRepo;
    final V2TenantController v2TenantCtrl;

    // ── Product Master ─────────────────────────────────────────────────────────
    final JsonBlobRepository productRepo;
    final ProductController productCtrl;
    final V2ScalarDbScanController v2ScalarDbScanCtrl;
    final V2ScalarDbRowController v2ScalarDbRowCtrl;
    final V2BatchPdfController v2BatchPdfCtrl;
    final JsonBlobRepository sequenceRepo;
    final SequenceController sequenceCtrl;
    final JsonBlobRepository webhookRepo;
    final WebhookDispatcher webhookDispatcher;
    final WebhookController webhookCtrl;
    final java.util.concurrent.ExecutorService webhookExecutor;

    // ── Admin controllers ─────────────────────────────────────────────────────
    final AdminUserController adminUserCtrl;
    final AdminServerController adminServerCtrl;

    // ── Controllers ───────────────────────────────────────────────────────────
    final AuthController authCtrl;
    final TemplateController templateCtrl;
    final ProjectionController projCtrl;
    final GenericJsonController schemaCtrl;
    final SchemaController schemaCreateCtrl;
    final GenericJsonController bindingCtrl;
    final TemplateExportController exportCtrl;
    final FormResponseController responseCtrl;
    final PublicFormController publicFormCtrl;
    final SubmissionExportController submissionExportCtrl;
    final VersionController versionCtrl;
    final JobController jobCtrl;
    final PdfController pdfCtrl;
    final ThumbnailController thumbnailCtrl;

    // ── Executor pools ────────────────────────────────────────────────────────
    private final com.report.server.job.JobTtlReaper jobTtlReaper;
    private final ExecutorService jobExecutor;
    final ExecutorService pdfExecutor;
    private final FormSessionManager formSessionManager;

    // ── V2 rate limiters ──────────────────────────────────────────────────────
    /** 5 response submissions per user per 60 seconds. */
    final RateLimiter v2SubmitLimiter;
    /** 3 exports per user per 60 seconds. */
    final RateLimiter v2ExportLimiter;

    public AppWiring(TransactionFactory factory) {
        // Repositories
        projRepo = new ProjectionRepository(factory);
        projRepo.ensureTable();

        schemaRepo = new JsonBlobRepository(factory, NAMESPACE, "schemas");
        schemaRepo.ensureTable();

        bindingTreeRepo = new JsonBlobRepository(factory, NAMESPACE, "binding_trees");
        bindingTreeRepo.ensureTable();

        templateList = new TemplateListRepository();

        UserRepository userRepo = new UserRepository(factory);
        userRepo.ensureTable();
        userRepo.ensureDefaultUser();

        jobRepo = new JobRepository(factory);
        jobRepo.ensureTable();
        jobRepo.reconcileOrphans();
        // Unified TTL reclamation for all job types (issue #60)
        jobTtlReaper = new com.report.server.job.JobTtlReaper(jobRepo, 60);

        responseRepo = new JsonBlobRepository(factory, NAMESPACE, "form_responses");
        responseRepo.ensureTable();

        versionRepo = new VersionRepository(factory);
        versionRepo.ensureTable();

        v2DefinitionsRepo = new JsonBlobRepository(factory, NAMESPACE, "v2_definitions");
        v2DefinitionsRepo.ensureTable();

        v2ResponseRepo = new JsonBlobRepository(factory, NAMESPACE, "v2_form_responses");
        v2ResponseRepo.ensureTable();

        // Executor pools
        jobExecutor = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors() / 2));
        pdfExecutor = Executors.newFixedThreadPool(4);

        // V2 rate limiters
        v2SubmitLimiter = new RateLimiter(5, 60_000L);
        v2ExportLimiter = new RateLimiter(3, 60_000L);

        // Admin controllers
        adminUserCtrl = new AdminUserController(userRepo);
        adminServerCtrl = new AdminServerController(Path.of("scalardb.properties"));

        // Controllers
        authCtrl = new AuthController(userRepo);
        templateCtrl = new TemplateController(templateList, projRepo, schemaRepo, bindingTreeRepo);
        projCtrl = new ProjectionController(projRepo, versionRepo);
        schemaCtrl = new GenericJsonController(schemaRepo, "schema", "{}");
        schemaCreateCtrl = new SchemaController(schemaRepo);
        bindingCtrl = new GenericJsonController(bindingTreeRepo, "binding-tree", "{}");
        exportCtrl = new TemplateExportController(templateList, projRepo, schemaRepo, bindingTreeRepo);
        responseCtrl = new FormResponseController(responseRepo);
        formSessionManager = new FormSessionManager();
        publicFormCtrl = new PublicFormController(
            templateList, projRepo, responseRepo, formSessionManager, new RateLimiter());
        submissionExportCtrl = new SubmissionExportController(projRepo);
        versionCtrl = new VersionController(versionRepo, projRepo);
        v2TemplateCtrl = new V2TemplateController(v2DefinitionsRepo);

        // Schema Library
        final JsonBlobRepository schemaLibraryRepo = new JsonBlobRepository(factory, NAMESPACE, "schema_library");
        schemaLibraryRepo.ensureTable();
        schemaLibraryCtrl = new SchemaLibraryController(schemaLibraryRepo);
        v2EvalCtrl = new V2EvaluateController();
        v2VersionCtrl = new V2VersionController(factory, v2DefinitionsRepo);
        v2VersionCtrl.ensureTable();
        v2FormResponseCtrl = new V2FormResponseController(v2ResponseRepo, v2DefinitionsRepo, v2SubmitLimiter);
        v2ResponseExportCtrl = new V2ResponseExportController(v2ResponseRepo, v2DefinitionsRepo, v2ExportLimiter);
        v2ResponsePdfCtrl = new V2ResponsePdfController(v2ResponseRepo, v2DefinitionsRepo, pdfExecutor);
        v2PdfCtrl = new V2PdfController(v2DefinitionsRepo, pdfExecutor);
        v2ExportCtrl = new V2TemplateExportController(v2DefinitionsRepo, new RateLimiter(10, 60_000L));
        v2ThumbnailCtrl = new V2ThumbnailController(v2DefinitionsRepo, pdfExecutor);
        v2SchemaInferCtrl = new V2SchemaInferController();
        v2PdfJobCtrl = new V2PdfJobController(v2DefinitionsRepo, jobRepo, pdfExecutor);
        v2StatelessPdfCtrl = new V2StatelessPdfController(pdfExecutor);
        v2ScalarDbCatalogCtrl = new V2ScalarDbCatalogController(factory);
        v2ScalarDbTableCtrl = new V2ScalarDbTableController(factory);
        v2BindingResolveCtrl = new V2BindingResolveController(factory, v2DefinitionsRepo);
        tenantRepo = new JsonBlobRepository(factory, NAMESPACE, "tenant");
        tenantRepo.ensureTable();
        v2TenantCtrl = new V2TenantController(tenantRepo);
        // Tenant elements in PDFs resolve through this process-wide supplier (issue #54)
        TenantInfoProvider.setSupplier(() -> {
            try {
                var stored = tenantRepo.get("singleton");
                return stored.isPresent()
                        ? new com.fasterxml.jackson.databind.ObjectMapper().readTree(stored.get())
                        : null;
            } catch (Exception e) {
                return null;
            }
        });
        productRepo = new JsonBlobRepository(factory, NAMESPACE, "products");
        productRepo.ensureTable();
        productCtrl = new ProductController(productRepo);
        v2BindingResolveCtrl.setProductController(productCtrl);
        v2ScalarDbScanCtrl = new V2ScalarDbScanController(factory);
        v2ScalarDbRowCtrl = new V2ScalarDbRowController(factory);
        v2BatchPdfCtrl = new V2BatchPdfController(v2DefinitionsRepo, v2ResponseRepo, jobRepo, pdfExecutor);
        sequenceRepo = new JsonBlobRepository(factory, NAMESPACE, "sequences");
        sequenceRepo.ensureTable();
        sequenceCtrl = new SequenceController(sequenceRepo);
        v2FormResponseCtrl.setSequenceController(sequenceCtrl);
        webhookRepo = new JsonBlobRepository(factory, NAMESPACE, "webhooks");
        webhookRepo.ensureTable();
        webhookDispatcher = new WebhookDispatcher();
        webhookExecutor = new java.util.concurrent.ThreadPoolExecutor(
            2, 8, 60L, java.util.concurrent.TimeUnit.SECONDS,
            new java.util.concurrent.LinkedBlockingQueue<>(100),
            new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        webhookCtrl = new WebhookController(webhookRepo, webhookDispatcher, SecretCrypto.fromEnv());
        v2FormResponseCtrl.setWebhookController(webhookCtrl, webhookExecutor);
        jobCtrl = new JobController(jobRepo, new BatchPdfProcessor(projRepo, jobRepo), jobExecutor);
        pdfCtrl = new PdfController(projRepo, pdfExecutor);
        thumbnailCtrl = new ThumbnailController(projRepo);
    }

    /** Gracefully shuts down all executor pools (call from Javalin serverStopping event). */
    public void shutdown() {
        log.info("Shutting down executor pools...");
        authCtrl.shutdown();
        formSessionManager.shutdown();
        jobTtlReaper.close();
        jobExecutor.shutdown();
        pdfExecutor.shutdown();
        try {
            if (!jobExecutor.awaitTermination(10, TimeUnit.SECONDS)) jobExecutor.shutdownNow();
            if (!pdfExecutor.awaitTermination(10, TimeUnit.SECONDS)) pdfExecutor.shutdownNow();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            jobExecutor.shutdownNow();
            pdfExecutor.shutdownNow();
        }
    }
}
