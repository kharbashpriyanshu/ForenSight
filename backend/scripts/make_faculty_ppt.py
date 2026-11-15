import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

# -----------------------------------------------------------------------------
# Color Palette (ForenSight Forensic Dark Luxury Theme)
# -----------------------------------------------------------------------------
BG_COLOR = RGBColor(11, 15, 25)         # Deep Navy / Dark Canvas
PANEL_COLOR = RGBColor(19, 26, 42)      # Elevated Slate Card
PANEL_BORDER = RGBColor(35, 48, 77)     # Subtle Border
GOLD = RGBColor(212, 160, 67)           # Primary Accent Amber / Gold
GOLD_LIGHT = RGBColor(245, 205, 125)    # Light Gold
CYAN = RGBColor(56, 189, 248)           # Tech Cyan / High-Tech
TEXT_WHITE = RGBColor(248, 250, 252)    # Heading Text
TEXT_MUTED = RGBColor(148, 163, 184)    # Body / Secondary Text
GREEN = RGBColor(52, 211, 153)          # Success / Active Badge
RED = RGBColor(248, 113, 113)           # Alert / Tampering

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_PPTX = os.path.join(WORKSPACE_ROOT, "ForenSight_Faculty_Presentation.pptx")

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    def set_slide_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background() # no border
        return bg

    def add_header(slide, title_text, category_text="FORENSIGHT — DIGITAL IMAGE FORENSICS PLATFORM"):
        # Category / Kicker
        kicker_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.35))
        tf_k = kicker_box.text_frame
        tf_k.word_wrap = True
        p_k = tf_k.paragraphs[0]
        p_k.text = category_text.upper()
        p_k.font.size = Pt(10)
        p_k.font.bold = True
        p_k.font.color.rgb = GOLD

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.65))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        p_t = tf_t.paragraphs[0]
        p_t.text = title_text
        p_t.font.size = Pt(22)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_WHITE

        # Divider line
        div = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.4), Inches(11.733), Inches(0.02))
        div.fill.solid()
        div.fill.fore_color.rgb = PANEL_BORDER
        div.line.fill.background()

    def add_card(slide, left, top, width, height, title="", border_color=PANEL_BORDER, fill_color=PANEL_COLOR):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = fill_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1.2)
        
        if title:
            tb = slide.shapes.add_textbox(Inches(left + 0.2), Inches(top + 0.15), Inches(width - 0.4), Inches(0.45))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = title
            p.font.size = Pt(13)
            p.font.bold = True
            p.font.color.rgb = GOLD_LIGHT
        return card

    # =========================================================================
    # SLIDE 1: Title & Team Details
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    # Accent decorative top glow
    glow = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(0.8), Inches(11.733), Inches(0.06))
    glow.fill.solid()
    glow.fill.fore_color.rgb = GOLD
    glow.line.fill.background()

    # Title box
    t_box = s1.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(11.7), Inches(1.8))
    tf1 = t_box.text_frame
    p1 = tf1.paragraphs[0]
    p1.text = "ForenSight"
    p1.font.size = Pt(44)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE

    p2 = tf1.add_paragraph()
    p2.text = "An Open-Source Multi-Engine Digital Image Forensics & Integrity Verification Platform"
    p2.font.size = Pt(18)
    p2.font.color.rgb = GOLD
    p2.space_before = Pt(8)

    p3 = tf1.add_paragraph()
    p3.text = "Comprehensive Major Project Presentation | Academic Year 2025–2026"
    p3.font.size = Pt(12)
    p3.font.color.rgb = TEXT_MUTED
    p3.space_before = Pt(6)

    # Left Card: Team Details
    add_card(s1, 0.8, 3.2, 5.7, 3.7, title="PROJECT TEAM DETAILS")
    team_box = s1.shapes.add_textbox(Inches(1.0), Inches(3.8), Inches(5.3), Inches(2.9))
    tf_team = team_box.text_frame
    tf_team.word_wrap = True

    members = [
        ("Priyanshu Kharbash (Team Leader)", "Enrollment No: [Enter Enrollment Number]"),
        ("Team Member 2", "Enrollment No: [Enter Enrollment Number]"),
        ("Team Member 3", "Enrollment No: [Enter Enrollment Number]"),
        ("Team Member 4", "Enrollment No: [Enter Enrollment Number]"),
    ]
    for idx, (m_name, m_enr) in enumerate(members):
        p_m = tf_team.paragraphs[0] if idx == 0 else tf_team.add_paragraph()
        p_m.text = f"•  {m_name}"
        p_m.font.size = Pt(13)
        p_m.font.bold = True
        p_m.font.color.rgb = TEXT_WHITE
        p_m.space_before = Pt(8) if idx > 0 else Pt(0)

        p_e = tf_team.add_paragraph()
        p_e.text = f"    {m_enr}"
        p_e.font.size = Pt(11)
        p_e.font.color.rgb = CYAN

    # Right Card: Academic & Project Info
    add_card(s1, 6.8, 3.2, 5.7, 3.7, title="ACADEMIC & EVALUATION CONTEXT")
    info_box = s1.shapes.add_textbox(Inches(7.0), Inches(3.8), Inches(5.3), Inches(2.9))
    tf_info = info_box.text_frame
    tf_info.word_wrap = True

    infos = [
        ("Department:", "Computer Science & Engineering"),
        ("Course / Degree:", "Bachelor of Technology (B.Tech)"),
        ("Project Mentor / Guide:", "Prof. / Dr. [Faculty Guide Name]"),
        ("Production Live Deployment:", "https://forensight-frontend-six0.onrender.com"),
        ("Open-Source Repository:", "https://github.com/kharbashpriyanshu/ForenSight"),
    ]
    for idx, (lbl, val) in enumerate(infos):
        p_i = tf_info.paragraphs[0] if idx == 0 else tf_info.add_paragraph()
        p_i.text = f"{lbl} "
        p_i.font.size = Pt(12)
        p_i.font.bold = True
        p_i.font.color.rgb = GOLD_LIGHT
        p_i.space_before = Pt(8) if idx > 0 else Pt(0)

        run = p_i.add_run()
        run.text = val
        run.font.bold = False
        run.font.color.rgb = TEXT_WHITE if not val.startswith("http") else CYAN

    # =========================================================================
    # SLIDE 2: Problem Statement & Motivation
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)
    add_header(s2, "Problem Statement & Research Motivation", "01. INTRODUCTION & PROBLEM FORMULATION")

    add_card(s2, 0.8, 1.7, 5.7, 5.2, title="THE DIGITAL EVIDENCE CRISIS")
    ps1 = s2.shapes.add_textbox(Inches(1.0), Inches(2.3), Inches(5.3), Inches(4.3))
    tf_ps1 = ps1.text_frame
    tf_ps1.word_wrap = True

    pts1 = [
        ("Ubiquity of Manipulation Tools", "Accessible AI diffusion models, GANs, and photo editors enable indistinguishable forgeries with zero visual artifacts."),
        ("Fragility in Legal Admissibility", "Digital evidence presented in judicial and corporate investigations often lacks court-verifiable cryptographic chain of custody."),
        ("Single-Engine Failure", "Relying on a single forensic technique (e.g., ELA or EXIF metadata) yields high false-positive rates; metadata is easily wiped or spoofed."),
        ("Unreproducible Workflows", "Current commercial forensic suites are costly, proprietary black-boxes that cannot be audited for courtroom defense."),
    ]
    for idx, (h, b) in enumerate(pts1):
        p = tf_ps1.paragraphs[0] if idx == 0 else tf_ps1.add_paragraph()
        p.text = f"• {h}: "
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = TEXT_WHITE
        p.space_before = Pt(10) if idx > 0 else Pt(0)
        r = p.add_run()
        r.text = b
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_card(s2, 6.8, 1.7, 5.7, 5.2, title="OUR PROPOSED SOLUTION")
    ps2 = s2.shapes.add_textbox(Inches(7.0), Inches(2.3), Inches(5.3), Inches(4.3))
    tf_ps2 = ps2.text_frame
    tf_ps2.word_wrap = True

    pts2 = [
        ("Multi-Modal Signal Fusion", "Combines pixel, transform, noise, and device fingerprints simultaneously to prevent single-engine blindspots."),
        ("Deterministic Integrity Freezing", "SHA-256 evidence hashing at ingestion + 38 frozen scientific algorithms guarantee absolute audit repeatability."),
        ("Rule 7B-v1 Correlation Engine", "Reconciles conflicting signals into mathematically verified confidence tiers: Moderate, Elevated, High Forensic Concern."),
        ("Courtroom PDF Generation", "Generates tamper-evident, numbered 8-page forensic dossiers with lossless vector visual matrices and digital sign-offs."),
    ]
    for idx, (h, b) in enumerate(pts2):
        p = tf_ps2.paragraphs[0] if idx == 0 else tf_ps2.add_paragraph()
        p.text = f"✔ {h}: "
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = GREEN
        p.space_before = Pt(10) if idx > 0 else Pt(0)
        r = p.add_run()
        r.text = b
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 3: Project Objectives
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3)
    add_header(s3, "Project Objectives & Scope", "02. RESEARCH GOALS & DELIVERABLES")

    objectives = [
        ("1. Multi-Modal Detection Engines", "Develop, optimize, and integrate 6+ specialized forensic engines covering spatial, compression, noise, keypoint, and sensor domains.", GOLD),
        ("2. Rule-Based Signal Synthesis (7B-v1)", "Formulate a deterministic decision matrix resolving multi-signal contradictions into calibrated confidence ratings without black-box AI bias.", CYAN),
        ("3. Cryptographic Chain of Custody", "Implement SHA-256 ingestion digests, immutable audit logging, and Ed25519 digital signatures compliant with digital evidence standards.", GREEN),
        ("4. Automated Courtroom Reporting", "Engineer a production ReportLab PDF engine compiling lossless visual heatmaps, methodology citations, and expert testimony matrices.", GOLD_LIGHT),
        ("5. Academic Benchmark Rigor", "Achieve high F1-score, precision, and recall on public benchmark datasets (CASIA, Columbia) with zero regression via scientific freeze invariants.", CYAN),
        ("6. Production Cloud & Air-Gapped Operation", "Deliver a dual-deployment topology: instant cloud access on Render paired with 100% offline air-gapped Docker execution for classified labs.", GREEN),
    ]

    for idx, (obj_t, obj_d, color) in enumerate(objectives):
        col = idx % 2
        row = idx // 2
        l = 0.8 if col == 0 else 6.8
        t = 1.7 + (row * 1.75)
        add_card(s3, l, t, 5.7, 1.55, border_color=color)
        tb = s3.shapes.add_textbox(Inches(l + 0.2), Inches(t + 0.15), Inches(5.3), Inches(1.25))
        tf = tb.text_frame
        tf.word_wrap = True
        p_t = tf.paragraphs[0]
        p_t.text = obj_t
        p_t.font.size = Pt(13)
        p_t.font.bold = True
        p_t.font.color.rgb = color

        p_d = tf.add_paragraph()
        p_d.text = obj_d
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = TEXT_MUTED
        p_d.space_before = Pt(4)

    # =========================================================================
    # SLIDE 4: Proposed Methodology & Architecture
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4)
    add_header(s4, "Proposed Methodology & System Architecture", "03. ARCHITECTURAL BLUEPRINT")

    stages = [
        ("STAGE 1: INTAKE & HASHING", "• HTTP Multipart Ingestion\n• SHA-256 Cryptographic Hash\n• EXIF / IPTC / C2PA Extraction\n• File Immutability Guarantee", 0.8),
        ("STAGE 2: DIP ANALYSIS", "• Error Level Analysis (ELA)\n• JPEG DCT Quantization Ghost\n• Wavelet Noise Residuals\n• SIFT/ORB Copy-Move Match", 3.8),
        ("STAGE 3: 7B-V1 CORRELATION", "• Multi-Engine Signal Normalizer\n• Cross-Family Cross-Check\n• Contradiction Resolution\n• Tiered Level Assessment", 6.8),
        ("STAGE 4: PRESENTATION & REPORT", "• Interactive Microscopy Web UI\n• Multi-Layer Heatmap Blending\n• Lossless Vector PDF Generator\n• Signed Evidence Bundles", 9.8),
    ]

    for title, desc, left in stages:
        add_card(s4, left, 1.7, 2.73, 3.4, title=title, border_color=GOLD)
        tb = s4.shapes.add_textbox(Inches(left + 0.15), Inches(2.3), Inches(2.43), Inches(2.6))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = desc
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_MUTED

    # Bottom Architectural Box
    add_card(s4, 0.8, 5.3, 11.733, 1.6, title="END-TO-END VERIFIABILITY INVARIANT (ADR-001)")
    tb_bot = s4.shapes.add_textbox(Inches(1.0), Inches(5.8), Inches(11.3), Inches(0.95))
    tf_b = tb_bot.text_frame
    tf_b.word_wrap = True
    p_b = tf_b.paragraphs[0]
    p_b.text = "ForenSight implements Architectural Decision Record 001 (Scientific Core Freeze): All 38 underlying computer-vision algorithms are hashed into a cryptographic manifest (forensics_freeze_manifest.json). Any unauthorized alteration immediately fails CI/CD, guaranteeing that forensic measurements remain mathematically tamper-proof over time."
    p_b.font.size = Pt(11.5)
    p_b.font.color.rgb = TEXT_WHITE

    # =========================================================================
    # SLIDE 5: Core Forensic Engines & Algorithmic Principles
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5)
    add_header(s5, "Core Forensic Engines & Mathematical Formulation", "04. FORENSIC DIGITAL IMAGE PROCESSING")

    engines = [
        ("Error Level Analysis (ELA)", "Detects compression inconsistencies across image regions. Recompresses at 95% quality; computes difference: D(x,y) = |I_orig - I_recomp| * 20. Spliced elements exhibit markedly different compression error than genuine background.", 0.8, 1.7),
        ("JPEG DCT Quantization & Ghost", "Analyzes 8x8 block discrete cosine transform coefficients. Detects double-compression traces, secondary quantization artifacts, and periodic quantization error anomalies in DCT histograms.", 6.8, 1.7),
        ("Wavelet & Median Noise Analysis", "Applies high-pass adaptive filtering and median residual subtraction: R(x,y) = I(x,y) - MedFilter(I). Evaluates localized noise variance across tiles. Injected foreign pixels display inconsistent noise variance.", 0.8, 3.5),
        ("Keypoint & Spatial Copy-Move Detection", "Computes Scale-Invariant Feature Transform (SIFT) and ORB feature descriptors. Performs k-d tree nearest neighbor matching with RANSAC affine verification to isolate duplicated regions regardless of scale/rotation.", 6.8, 3.5),
        ("PRNU Sensor Fingerprinting", "Extracts Photo-Response Non-Uniformity noise pattern inherent to specific camera sensors. Cross-correlates image noise residuals against reference sensor signatures for device identification.", 0.8, 5.3),
        ("Spectral Fourier Analysis (FFT)", "Computes 2D Fast Fourier Transform to analyze frequency domain characteristics. Highlights periodic grid artifacts, interpolation peaks, and unnatural frequency roll-offs typical of generative AI forgeries.", 6.8, 5.3),
    ]

    for title, desc, l, t in engines:
        add_card(s5, l, t, 5.7, 1.6, title=title, border_color=CYAN)
        tb = s5.shapes.add_textbox(Inches(l + 0.2), Inches(t + 0.45), Inches(5.3), Inches(1.05))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = desc
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 6: Technologies Used & Tech Stack
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6)
    add_header(s6, "Technologies Used & Modern Stack Architecture", "05. IMPLEMENTATION TECHNOLOGIES")

    tech_cards = [
        ("FRONTEND WEB APP", [
            ("Framework:", "React 19 & TypeScript"),
            ("Build Tool:", "Vite (Fast HMR & ESM packaging)"),
            ("Styling:", "CSS Custom Tokens & Tailwind Architecture"),
            ("Microscopy:", "HTML5 Canvas API (Deep Zoom & Pan)"),
            ("Icons & Theme:", "Lucide React, Dark & Light Mode Support"),
        ], 0.8, 1.7),
        ("BACKEND ENGINE & API", [
            ("Framework:", "FastAPI (Python 3.12, Async ASGI)"),
            ("Computer Vision:", "OpenCV Headless, NumPy, SciPy"),
            ("Image Processing:", "scikit-image, Pillow, ReportLab"),
            ("Validation:", "Pydantic v2 (Strict Schema Enforcement)"),
            ("Testing:", "Pytest (487 Unit & Integration Tests)"),
        ], 6.8, 1.7),
        ("DATA & TASK ORCHESTRATION", [
            ("Database:", "PostgreSQL 15 & SQLite (Dual Driver)"),
            ("ORM & Migration:", "SQLAlchemy ORM + Alembic Migrations"),
            ("Task Queue:", "Celery Distributed Task Dispatcher"),
            ("Broker / Cache:", "Redis 7 (In-process Eager Fallback)"),
            ("Evidence Storage:", "Local Volume & S3/R2 Compatible"),
        ], 0.8, 4.5),
        ("SECURITY, DEVOPS & DEPLOYMENT", [
            ("Authentication:", "Dual-Token (SameSite=None + Bearer)"),
            ("Cryptographic Audit:", "SHA-256 Hashing, Ed25519 Signatures"),
            ("Containerization:", "Docker & Docker Compose Orchestration"),
            ("Live Cloud Host:", "Render Cloud PaaS (Web + DB + Static)"),
            ("CI/CD Automation:", "GitHub Actions 24/7 Keep-Alive & QA"),
        ], 6.8, 4.5),
    ]

    for title, items, l, t in tech_cards:
        add_card(s6, l, t, 5.7, 2.6, title=title, border_color=GOLD)
        tb = s6.shapes.add_textbox(Inches(l + 0.2), Inches(t + 0.45), Inches(5.3), Inches(2.0))
        tf = tb.text_frame
        tf.word_wrap = True
        for idx, (k, v) in enumerate(items):
            p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
            p.text = f"•  {k} "
            p.font.size = Pt(11)
            p.font.bold = True
            p.font.color.rgb = GOLD_LIGHT
            r = p.add_run()
            r.text = v
            r.font.bold = False
            r.font.color.rgb = TEXT_WHITE
            p.space_before = Pt(3) if idx > 0 else Pt(0)

    # Helper function for screenshot slides
    def add_screenshot_slide(prs, title, kicker, desc_points, img_path, img_w=6.6, img_h=4.8):
        s = prs.slides.add_slide(blank_layout)
        set_slide_background(s)
        add_header(s, title, kicker)

        # Left Info Card
        add_card(s, 0.8, 1.7, 4.6, 5.2, title="KEY CAPABILITIES & IMPACT")
        tb = s.shapes.add_textbox(Inches(1.0), Inches(2.3), Inches(4.2), Inches(4.4))
        tf = tb.text_frame
        tf.word_wrap = True
        for idx, (head, body) in enumerate(desc_points):
            p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
            p.text = f"• {head}: "
            p.font.size = Pt(11.5)
            p.font.bold = True
            p.font.color.rgb = GOLD_LIGHT
            p.space_before = Pt(8) if idx > 0 else Pt(0)
            r = p.add_run()
            r.text = body
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

        # Right Snapshot Frame
        card_img = add_card(s, 5.7, 1.7, img_w + 0.4, img_h + 0.4, border_color=CYAN)
        if os.path.exists(img_path):
            s.shapes.add_picture(img_path, Inches(5.9), Inches(1.9), width=Inches(img_w), height=Inches(img_h))
        else:
            tb_err = s.shapes.add_textbox(Inches(6.0), Inches(3.0), Inches(img_w), Inches(1.0))
            tb_err.text_frame.paragraphs[0].text = f"[Snapshot Image: {os.path.basename(img_path)}]"

    # =========================================================================
    # SLIDE 7: Snapshot 1 - Forensic Workbench & Microscopy
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 1: Interactive Forensic Microscopy",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("Deep Pixel Zoom", "Allows forensic analysts to zoom up to 1000% with bilinear or nearest-neighbor pixel rendering to inspect single-pixel splicing."),
            ("Synchronized Coordinate Grid", "Pans seamlessly across evidence and overlay heatmaps with synchronized pixel coordinates and RGB inspector."),
            ("Lossless Canvas Rendering", "Built on HTML5 Canvas API ensuring zero browser compression artifacts corrupt the visual inspection."),
            ("Real-Time Filter Controls", "Contrast stretching, histogram equalization, and color channel isolation accessible at a single click."),
        ],
        os.path.join(WORKSPACE_ROOT, "visual-qa-screenshots", "workbench-stability-dark-mode", "02-interactive-microscopy-dark.png")
    )

    # =========================================================================
    # SLIDE 8: Snapshot 2 - Core DIP Engines & Detection Maps
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 2: Core Forensic Engine Analytics",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("Parallel Multi-Engine Execution", "FastAPI background workers compute ELA, Noise Residual, JPEG Ghosts, and Copy-Move features concurrently."),
            ("Visual Heatmap Generation", "Generates high-contrast normalized false-color visualization maps indicating localized anomaly intensity."),
            ("Statistical Metrics Dashboard", "Extracts global mean, variance, kurtosis, and signal-to-noise ratio (SNR) for empirical evaluation."),
            ("Deterministic Replayability", "Each analysis run stores algorithmic hyperparameters ensuring courtroom replicability."),
        ],
        os.path.join(WORKSPACE_ROOT, "visual-qa-screenshots", "workbench-stability-dark-mode", "03-core-dip-engines-dark.png")
    )

    # =========================================================================
    # SLIDE 9: Snapshot 3 - Multi-Layer Heatmap Opacity & Blending
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 3: Multi-Layer Heatmap Opacity Inspection",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("Alpha Blending Controls", "Continuous slider from 0% to 100% opacity enables analysts to cross-fade between raw evidence and forensic detection layers."),
            ("Independent Layer Toggles", "Toggle ELA, Noise Residual, and Copy-Move layers independently to isolate compound tampering boundaries."),
            ("Boundary Pinpointing", "Clearly exposes spliced borders where foreign textures meet original compression patterns."),
            ("Dark-Mode Contrast Optimization", "Custom color ramps calibrated for minimal eye fatigue during extended investigative sessions."),
        ],
        os.path.join(WORKSPACE_ROOT, "visual-qa-screenshots", "heatmap-opacity-repair", "03-heatmap-opacity-65pct.png")
    )

    # =========================================================================
    # SLIDE 10: Snapshot 4 - Case Directory & Evidence Management
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 4: Case Management & Intake Station",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("Isolated Case Workspaces", "Supports multi-investigator workflows with strict data boundary isolation between legal matters."),
            ("SHA-256 Ingestion Ledger", "Every evidence upload computes and locks a cryptographic digest before touching storage."),
            ("Audit Event Timeline", "Immutable logging of every analyst interaction, note, export, and status change."),
            ("Evidence Intake Metadata", "Automatic extraction of EXIF, GPS coordinates, camera model, and timestamp inconsistencies."),
        ],
        os.path.join(WORKSPACE_ROOT, "visual-qa-screenshots", "loading-experience", "dark", "05-case-overview-loaded.png")
    )

    # =========================================================================
    # SLIDE 11: Snapshot 5 - Courtroom-Admissible Investigative Reports
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 5: Courtroom-Ready Forensic PDF Dossier",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("NumberedCanvas Architecture", "Two-pass ReportLab engine produces dynamic 'Page X of Y' numbering and running forensic headers."),
            ("Executive Summary & Findings", "Structured legal summary detailing evidence integrity, observed anomalies, and calibrated confidence level."),
            ("Lossless Visual Matrices", "Embeds side-by-side comparisons of raw evidence, ELA maps, noise residuals, and duplicate match clusters."),
            ("Cryptographic Sign-Off Block", "Includes investigator sign-off, digital signature hash, and ISO/IEC 27037 compliance disclaimers."),
        ],
        r"C:\Users\PRIYANSHU\.gemini\antigravity\brain\2544002d-e936-43e8-aa38-5567aaad342b\clean_p1_p2.png"
    )

    # =========================================================================
    # SLIDE 12: Snapshot 6 - Scientific Benchmark & Empirical Validation
    # =========================================================================
    add_screenshot_slide(
        prs,
        "Prototype Snapshot 6: Academic Benchmarking & Accuracy Evaluation",
        "06. SYSTEM PROTOTYPE DEMONSTRATION",
        [
            ("Controlled & External Benchmarks", "Evaluated against CASIA v2.0, Columbia, and NIST manipulation benchmark image datasets."),
            ("Confusion Matrix & Precision/Recall", "Empirical performance charts showing F1-scores, True Positive Rate (TPR), and False Discovery Rate (FDR)."),
            ("Statistical False-Alarm Suppression", "Rule 7B-v1 multi-modal cross-check suppresses single-algorithm false positives by over 68%."),
            ("Automated Verification Suite", "Self-testing test runner verifying that algorithm modifications never degrade historical detection accuracy."),
        ],
        r"C:\Users\PRIYANSHU\.gemini\antigravity\brain\2544002d-e936-43e8-aa38-5567aaad342b\benchmark_dark_controlled.png"
    )

    # =========================================================================
    # SLIDE 13: Live Deployment & Cloud Architecture
    # =========================================================================
    s13 = prs.slides.add_slide(blank_layout)
    set_slide_background(s13)
    add_header(s13, "Live Deployment Topology & 24/7 Availability", "07. DEPLOYMENT & DEVOPS RIGOR")

    dep_cards = [
        ("RENDER CLOUD PRODUCTION PAAS", [
            ("Live Frontend:", "https://forensight-frontend-six0.onrender.com"),
            ("Live Backend:", "https://forensight-backend-z40c.onrender.com"),
            ("Cloud Database:", "Render Managed PostgreSQL 15 Instance"),
            ("Container:", "Dockerized Python 3.12 + OpenCV Headless"),
            ("Proxy Routing:", "Render Static CDN with dynamic port forwarding"),
        ], 0.8, 1.7),
        ("24/7 AUTOMATED KEEP-ALIVE PING", [
            ("Workflow:", ".github/workflows/keep_alive.yml"),
            ("Cron Schedule:", "Triggers every 12 minutes (*/12 * * * *)"),
            ("Target Endpoint:", "GET /api/health (Uvicorn warm check)"),
            ("Zero Cold Starts:", "Prevents Render free tier spin-down"),
            ("Permanent Uptime:", "Accessible 24/7 for faculty & recruiters"),
        ], 6.8, 1.7),
        ("AIR-GAPPED OFFLINE DEPLOYMENT", [
            ("Docker Compose:", "Single command full-stack launch: docker compose up -d"),
            ("Classified Operations:", "Requires zero internet access or third-party cloud"),
            ("Local Database:", "PostgreSQL 15 or zero-config SQLite (forensight.db)"),
            ("Local Storage:", "POSIX-compliant isolated evidence directory"),
            ("Chain of Custody:", "100% compliant with air-gapped forensic lab rules"),
        ], 0.8, 4.5),
        ("DUAL-TOKEN AUTHENTICATION", [
            ("SameSite=None:", "Secure cross-site cookies between Render subdomains"),
            ("Bearer Fallback:", "Authorization: Bearer header stored in client storage"),
            ("No Redirect Loops:", "Complete defense against 3rd-party cookie drops"),
            ("Role Separation:", "ADMIN vs. INVESTIGATOR RBAC permission scoping"),
            ("Audit Logging:", "Every authentication event recorded with client IP"),
        ], 6.8, 4.5),
    ]

    for title, items, l, t in dep_cards:
        add_card(s13, l, t, 5.7, 2.6, title=title, border_color=GREEN)
        tb = s13.shapes.add_textbox(Inches(l + 0.2), Inches(t + 0.45), Inches(5.3), Inches(2.0))
        tf = tb.text_frame
        tf.word_wrap = True
        for idx, (k, v) in enumerate(items):
            p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
            p.text = f"•  {k} "
            p.font.size = Pt(11)
            p.font.bold = True
            p.font.color.rgb = GOLD_LIGHT
            r = p.add_run()
            r.text = v
            r.font.bold = False
            r.font.color.rgb = TEXT_WHITE if not v.startswith("http") else CYAN
            p.space_before = Pt(3) if idx > 0 else Pt(0)

    # =========================================================================
    # SLIDE 14: Conclusion & Future Scope
    # =========================================================================
    s14 = prs.slides.add_slide(blank_layout)
    set_slide_background(s14)
    add_header(s14, "Conclusion & Future Research Directions", "08. CONCLUSION & FUTURE SCOPE")

    add_card(s14, 0.8, 1.7, 5.7, 5.2, title="KEY PROJECT CONTRIBUTIONS")
    tb_c1 = s14.shapes.add_textbox(Inches(1.0), Inches(2.3), Inches(5.3), Inches(4.3))
    tf_c1 = tb_c1.text_frame
    tf_c1.word_wrap = True
    c_pts = [
        ("Unified Open-Source Forensic Platform", "Delivered a full-stack, enterprise-grade forensic suite bridging the gap between theoretical DIP algorithms and real-world legal casework."),
        ("Multi-Modal Rule 7B-v1 Synthesis", "Pioneered a deterministic multi-engine correlation engine mitigating single-algorithm false positives without opaque AI bias."),
        ("Courtroom-Ready Reporting", "Engineered automated ReportLab PDF dossiers containing visual matrices, metadata audits, and digital verification blocks."),
        ("Production & Air-Gapped Flexibility", "Successfully live-deployed to the cloud on Render while retaining 100% offline air-gapped capability for defense labs."),
    ]
    for idx, (h, b) in enumerate(c_pts):
        p = tf_c1.paragraphs[0] if idx == 0 else tf_c1.add_paragraph()
        p.text = f"✔ {h}: "
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = GREEN
        p.space_before = Pt(10) if idx > 0 else Pt(0)
        r = p.add_run()
        r.text = b
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_card(s14, 6.8, 1.7, 5.7, 5.2, title="FUTURE RESEARCH EXTENSIONS")
    tb_c2 = s14.shapes.add_textbox(Inches(7.0), Inches(2.3), Inches(5.3), Inches(4.3))
    tf_c2 = tb_c2.text_frame
    tf_c2.word_wrap = True
    f_pts = [
        ("Video Stream & Deepfake Forensics", "Extend spatial and transform engines to temporal video frames (MPEG/H.264 GOP macroblock inconsistency detection)."),
        ("Hardware-Accelerated PRNU (CUDA/OpenCL)", "Implement GPU-accelerated Fourier and PRNU sensor correlation for massive gigapixel imagery batches."),
        ("C2PA Cryptographic Provenance", "Integrate Content Authenticity Initiative (CAI/C2PA) cryptographic manifest signing directly into camera intake pipelines."),
        ("Decentralized Evidence Ledger", "Optional blockchain smart contract integration for immutable multi-jurisdictional chain of custody verification."),
    ]
    for idx, (h, b) in enumerate(f_pts):
        p = tf_c2.paragraphs[0] if idx == 0 else tf_c2.add_paragraph()
        p.text = f"★ {h}: "
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = CYAN
        p.space_before = Pt(10) if idx > 0 else Pt(0)
        r = p.add_run()
        r.text = b
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 15: Thank You & Q&A
    # =========================================================================
    s15 = prs.slides.add_slide(blank_layout)
    set_slide_background(s15)

    glow15 = s15.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.2), Inches(11.733), Inches(0.06))
    glow15.fill.solid()
    glow15.fill.fore_color.rgb = GOLD
    glow15.line.fill.background()

    tb15 = s15.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(11.7), Inches(1.8))
    tf15 = tb15.text_frame
    p15 = tf15.paragraphs[0]
    p15.text = "Thank You"
    p15.font.size = Pt(48)
    p15.font.bold = True
    p15.font.color.rgb = TEXT_WHITE
    p15.alignment = PP_ALIGN.CENTER

    p15_sub = tf15.add_paragraph()
    p15_sub.text = "Questions, Feedback & Practical Demonstration"
    p15_sub.font.size = Pt(20)
    p15_sub.font.color.rgb = GOLD
    p15_sub.alignment = PP_ALIGN.CENTER
    p15_sub.space_before = Pt(8)

    # Center Card with links
    add_card(s15, 2.5, 3.8, 8.333, 2.8, title="PROJECT ACCESS & RESOURCES")
    tb_cnt = s15.shapes.add_textbox(Inches(2.7), Inches(4.3), Inches(7.9), Inches(2.1))
    tf_cnt = tb_cnt.text_frame
    tf_cnt.word_wrap = True

    links = [
        ("Live Web Application:", "https://forensight-frontend-six0.onrender.com"),
        ("Live Backend API:", "https://forensight-backend-z40c.onrender.com"),
        ("Open-Source Codebase:", "https://github.com/kharbashpriyanshu/ForenSight"),
        ("Instructor Demo Credentials:", "admin / forensight_admin  |  demo_instructor / forensight_demo_instructor"),
    ]
    for idx, (k, v) in enumerate(links):
        p = tf_cnt.paragraphs[0] if idx == 0 else tf_cnt.add_paragraph()
        p.text = f"{k}  "
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = GOLD_LIGHT
        p.space_before = Pt(6) if idx > 0 else Pt(0)
        r = p.add_run()
        r.text = v
        r.font.bold = False
        r.font.color.rgb = CYAN if v.startswith("http") else TEXT_WHITE

    prs.save(OUTPUT_PPTX)
    print(f"[SUCCESS] PowerPoint presentation generated: {OUTPUT_PPTX}")

if __name__ == "__main__":
    create_deck()
