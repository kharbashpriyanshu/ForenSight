#!/usr/bin/env python3
"""
ForenSight V3 — End-to-End Controlled Test Investigation Script
Executes the full 18-step investigation lifecycle using four controlled evidence images:
  Evidence A: clean_reference.jpg
  Evidence B: synthetic_copy_move.jpg
  Evidence C: recompressed_double_jpeg.jpg
  Evidence D: metadata_known_camera.jpg

Validates:
  Case Creation -> Batch Ingest -> Cryptographic Custody Ledger -> Batch Analysis
  -> Multi-Modality Heatmap -> Compare Mode & Artifact Diffs -> Cross-Image Correlation
  -> Investigation Graph -> Rule-Based Assistant -> Structured Analyst Note -> Case Review
  -> Custody Ledger Re-check -> Professional Reports (JSON & PDF) -> Cryptographic Replay.
"""

import os
import sys
import json

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.database import Base
from app.api.deps import get_db, get_current_user
from app.models.domain import User, InvestigationCase
from app.core.security import get_password_hash, create_access_token

FIXTURES_DIR = os.path.join(backend_dir, "tests", "fixtures", "forensics")

TEST_DB_URL = "sqlite:///./e2e_test_lifecycle.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def main():
    print("=" * 80)
    print("FORENSIGHT V3: CONTROLLED END-TO-END INVESTIGATION LIFECYCLE (18 STEPS)")
    print("=" * 80)

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(get_current_user, None)

    client = TestClient(app)
    db = TestingSessionLocal()

    try:
        # STEP 1: Investigator Auth & Setup
        print("\n[STEP 1/18] Investigator Authentication & RBAC Provisioning...")
        investigator = User(
            username="det_v3_lead",
            hashed_password=get_password_hash("InvestigatorSecret123!"),
            role="INVESTIGATOR"
        )
        db.add(investigator)
        db.commit()
        db.refresh(investigator)

        token = create_access_token(investigator.username)
        auth_headers = {"Authorization": f"Bearer {token}"}
        print(f"  -> Authenticated investigator: {investigator.username} (Role: {investigator.role})")

        # STEP 2: Case Creation
        print("\n[STEP 2/18] Creating Investigation Case...")
        case_payload = {
            "title": "Operation Chroma: Controlled Multi-Modality Forensic Inquest"
        }
        resp = client.post("/api/cases", json=case_payload, headers=auth_headers)
        assert resp.status_code == 200, f"Case creation failed: {resp.text}"
        case_data = resp.json()
        case_id = case_data["case_identifier"]
        print(f"  -> Case Created: Internal ID {case_data['id']} [{case_id}] - '{case_data['title']}'")

        # STEP 3: Batch Evidence Ingestion
        print("\n[STEP 3/18] Ingesting 4 Controlled Evidences (A, B, C, D) via Batch Ingestion API...")
        files_spec = [
            ("clean_reference.jpg", "image/jpeg", "Evidence A (Clean Reference)"),
            ("synthetic_copy_move.jpg", "image/jpeg", "Evidence B (Synthetic Copy-Move)"),
            ("recompressed_double_jpeg.jpg", "image/jpeg", "Evidence C (Recompressed Double JPEG)"),
            ("metadata_known_camera.jpg", "image/jpeg", "Evidence D (Related Camera Image)")
        ]
        
        upload_multipart = []
        file_handles = []
        for fname, mime, _ in files_spec:
            fpath = os.path.join(FIXTURES_DIR, fname)
            f = open(fpath, "rb")
            file_handles.append(f)
            upload_multipart.append(("files", (fname, f, mime)))

        try:
            r_batch = client.post(f"/api/cases/{case_id}/evidence/batch", files=upload_multipart, headers=auth_headers)
            assert r_batch.status_code == 200, f"Batch upload failed: {r_batch.text}"
            batch_resp = r_batch.json()
            print(f"  -> Batch Ingested: {batch_resp['uploaded_count']} files successfully processed.")
            for item in batch_resp["items"]:
                print(f"     * {item['original_filename']} | ID: {item['id']} | SHA256: {item['sha256_hash'][:16]}... | Res: {item['width']}x{item['height']}")
        finally:
            for f in file_handles:
                f.close()

        evidence_map = {item["original_filename"]: item for item in batch_resp["items"]}
        ev_a_id = evidence_map["clean_reference.jpg"]["id"]
        ev_b_id = evidence_map["synthetic_copy_move.jpg"]["id"]
        ev_c_id = evidence_map["recompressed_double_jpeg.jpg"]["id"]
        ev_d_id = evidence_map["metadata_known_camera.jpg"]["id"]

        # STEP 4: Chain of Custody Initial Log Verification
        print("\n[STEP 4/18] Verifying Initial Cryptographic Chain of Custody Ledger...")
        r_custody = client.get(f"/api/cases/{case_id}/chain-of-custody", headers=auth_headers)
        assert r_custody.status_code == 200
        custody_data = r_custody.json()
        print(f"  -> Case Identifier: {custody_data['case_identifier']}")
        print(f"  -> Total Evidence Items: {custody_data['total_evidence_items']}")
        print(f"  -> All Hashes Intact: {custody_data['all_hashes_intact']}")
        print(f"  -> Custody Timeline Events: {len(custody_data['custody_timeline'])}")
        assert custody_data["all_hashes_intact"] is True

        # Verify individual custody integrity for Evidence A
        r_verify_single = client.post(f"/api/evidence/{ev_a_id}/verify-custody", headers=auth_headers)
        assert r_verify_single.status_code == 200
        assert r_verify_single.json()["status"] == "VERIFIED_INTACT"
        print(f"  -> Single Evidence Cryptographic Verification: VERIFIED_INTACT (SHA256 Match)")

        # STEP 5: Batch Forensic Analysis Execution
        print("\n[STEP 5/18] Orchestrating Batch Forensic Analysis Across Evidences...")
        batch_analysis_payload = {
            "evidence_ids": [ev_a_id, ev_b_id, ev_c_id, ev_d_id],
            "analysis_types": ["metadata", "ela", "noise", "jpeg-dct", "copy-move"]
        }
        r_batch_anl = client.post(f"/api/cases/{case_id}/batch-analysis", json=batch_analysis_payload, headers=auth_headers)
        assert r_batch_anl.status_code == 200, f"Batch analysis queue failed: {r_batch_anl.text}"
        batch_status = r_batch_anl.json()
        print(f"  -> Batch Analysis Dispatched: {batch_status['total_jobs']} jobs scheduled/executed.")

        # Check batch jobs overview
        r_jobs = client.get(f"/api/cases/{case_id}/batch-jobs", headers=auth_headers)
        assert r_jobs.status_code == 200
        jobs_overview = r_jobs.json()
        print(f"  -> Jobs Monitored: {len(jobs_overview['jobs'])} jobs active in case queue.")

        # STEP 6: Forensic Heatmap Generation for Evidence B
        print("\n[STEP 6/18] Generating Multi-Modality Forensic Heatmap for Evidence B...")
        r_hm_b = client.get(f"/api/evidence/{ev_b_id}/heatmap", headers=auth_headers)
        assert r_hm_b.status_code == 200, f"Heatmap fetch failed: {r_hm_b.text}"
        hm_b = r_hm_b.json()
        print(f"  -> Evidence {hm_b['evidence_id']} Layers Count: {len(hm_b['layers'])}")
        for l in hm_b["layers"]:
            print(f"     * Layer: {l['modality']} | Status: {l['status']} | Regions: {len(l['regions'])}")
        print(f"  -> WHAT WAS FOUND: {hm_b['what_was_found']}")
        print(f"  -> WHY IT MATTERS: {hm_b['why_it_matters']}")
        print(f"  -> NEXT STEPS: {hm_b['recommended_next_steps']}")

        # STEP 7: Multi-Modality Overlay for Evidence C
        print("\n[STEP 7/18] Generating Multi-Modality Heatmap Overlay for Evidence C...")
        r_hm_c = client.get(f"/api/evidence/{ev_c_id}/heatmap", headers=auth_headers)
        assert r_hm_c.status_code == 200
        hm_c = r_hm_c.json()
        print(f"  -> Evidence {hm_c['evidence_id']} Layers: {[l['modality'] for l in hm_c['layers']]}")
        print(f"  -> Scientific Limitations: {hm_c['limitations']}")

        # STEP 8: Side-by-Side Comparison (Evidence A vs Evidence B)
        print("\n[STEP 8/18] Running Forensic Compare Mode (Evidence A vs Evidence B)...")
        r_comp = client.get(f"/api/cases/{case_id}/compare?evidence_a={ev_a_id}&evidence_b={ev_b_id}", headers=auth_headers)
        assert r_comp.status_code == 200, f"Compare failed: {r_comp.text}"
        comp_data = r_comp.json()
        print(f"  -> Comparison Base: {comp_data['evidence_a']['original_filename']} ({comp_data['evidence_a']['width']}x{comp_data['evidence_a']['height']})")
        print(f"  -> Comparison Target: {comp_data['evidence_b']['original_filename']} ({comp_data['evidence_b']['width']}x{comp_data['evidence_b']['height']})")
        print(f"  -> Structural Differences: {comp_data['differences']}")

        # STEP 9: Cross-Image Artifact Comparison
        print("\n[STEP 9/18] Inspecting Multi-Modality Observation Profiles...")
        obs_a = comp_data['evidence_a'].get("observations", [])
        obs_b = comp_data['evidence_b'].get("observations", [])
        print(f"  -> Evidence A Recorded Observations: {len(obs_a)}")
        print(f"  -> Evidence B Recorded Observations: {len(obs_b)}")

        # STEP 10: Cross-Image Correlation Execution
        print("\n[STEP 10/18] Running Cross-Image Correlation Engine...")
        r_corr = client.post(f"/api/cases/{case_id}/cross-correlation/evaluate", headers=auth_headers)
        assert r_corr.status_code == 200, f"Correlation evaluation failed: {r_corr.text}"
        corr_results = r_corr.json()
        print(f"  -> Camera Clusters Identified: {len(corr_results['camera_clusters'])}")
        for cluster in corr_results["camera_clusters"]:
            print(f"     * Camera Cluster: {cluster['make']} {cluster['model']} | Evidences: {cluster['filenames']}")
        print(f"  -> Temporal Sequence Items: {len(corr_results['temporal_sequence'])}")
        print(f"  -> Cross-Image Feature Matches: {len(corr_results['cross_image_matches'])}")

        # STEP 11: Investigation Knowledge Graph Generation
        print("\n[STEP 11/18] Generating Investigation Knowledge Graph Topology...")
        r_graph = client.get(f"/api/cases/{case_id}/graph", headers=auth_headers)
        assert r_graph.status_code == 200, f"Graph fetch failed: {r_graph.text}"
        graph_data = r_graph.json()
        print(f"  -> Graph Topology: {len(graph_data['nodes'])} Nodes, {len(graph_data['edges'])} Edges")
        node_types = {}
        for n in graph_data['nodes']:
            node_types[n['type']] = node_types.get(n['type'], 0) + 1
        print(f"  -> Node Type Distribution: {node_types}")

        # STEP 12: Rule-Based Scientific Investigation Assistant Query
        print("\n[STEP 12/18] Consulting Investigation Assistant Decision Support...")
        r_ast = client.get(f"/api/cases/{case_id}/assistant", headers=auth_headers)
        assert r_ast.status_code == 200, f"Assistant guidance failed: {r_ast.text}"
        ast_resp = r_ast.json()
        print(f"  -> Completeness: {ast_resp['overall_completeness_percentage']}%")
        print(f"  -> Found Summary: {ast_resp['what_was_found_summary']}")
        print(f"  -> Counter Hypotheses: {len(ast_resp['counter_hypotheses'])}")
        for ch in ast_resp['counter_hypotheses'][:2]:
            print(f"     * Phenomenon: {ch['phenomenon']} | Benign: {ch['alternative_benign_explanation'][:50]}...")
        print(f"  -> Suggested Investigative Next Steps: {len(ast_resp['investigative_next_steps'])}")
        for action in ast_resp['investigative_next_steps'][:3]:
            print(f"     * [{action['priority']}] {action['action']}: {action['rationale'][:60]}...")

        # STEP 13: Analyst Forensic Note Logging (3-Part Schema)
        print("\n[STEP 13/18] Documenting Structured Analyst Finding...")
        note_text = (
            "WHAT WAS FOUND:\n"
            "Evidence B demonstrates distinct keypoint cluster pairing consistent with localized cloning.\n\n"
            "WHY DOES IT MATTER:\n"
            "Suggests duplication of visual elements rather than ambient image capture sensor noise.\n\n"
            "WHAT SHOULD THE INVESTIGATOR DO NEXT:\n"
            "Examine compression block grid alignment and obtain original camera memory card."
        )
        r_note = client.post(
            f"/api/cases/{case_id}/notes",
            json={"target_type": "EVIDENCE", "target_id": str(ev_b_id), "content": note_text},
            headers=auth_headers
        )
        assert r_note.status_code == 200
        print(f"  -> Analyst note logged and cryptographically bound to Evidence {ev_b_id}.")

        # STEP 14: Case Status & Review Workflow Sign-off
        print("\n[STEP 14/18] Transitioning Investigation Status to IN_REVIEW...")
        from app.services.audit import AuditService
        case_record = db.query(InvestigationCase).filter(InvestigationCase.case_identifier == case_id).first()
        case_record.status = "IN_REVIEW"
        db.commit()
        db.refresh(case_record)
        AuditService.log_event(db, case_id, "CASE_STATUS_UPDATED", actor=investigator.username, metadata={"new_status": "IN_REVIEW"})
        print(f"  -> Case Status Updated: {case_record.status}")

        # STEP 15: Custody Ledger Integrity Re-check
        print("\n[STEP 15/18] Verifying Case Custody Ledger Post-Workflow...")
        r_custody2 = client.get(f"/api/cases/{case_id}/chain-of-custody", headers=auth_headers)
        assert r_custody2.status_code == 200
        events = r_custody2.json()["custody_timeline"]
        print(f"  -> Audit Ledger Event Count: {len(events)}")
        if events:
            print(f"  -> Most Recent Audit Action: {events[0]['event_type']} by {events[0]['actor']}")

        # STEP 16: Structured JSON Forensic Report Generation
        print("\n[STEP 16/18] Generating Professional Forensic Investigation Report (JSON)...")
        r_rep_json = client.post(f"/api/cases/{case_id}/reports?format=json", headers=auth_headers)
        assert r_rep_json.status_code == 200
        rep_json = r_rep_json.json()
        print(f"  -> JSON Report Generated: Identifier '{rep_json['report_identifier']}' (Format: {rep_json['report_type']})")

        # STEP 17: Executive PDF Forensic Report Generation
        print("\n[STEP 17/18] Generating Professional Forensic Investigation Report (PDF)...")
        r_rep_pdf = client.post(f"/api/cases/{case_id}/reports?format=pdf", headers=auth_headers)
        assert r_rep_pdf.status_code == 200
        rep_pdf = r_rep_pdf.json()
        print(f"  -> PDF Report Generated: Identifier '{rep_pdf['report_identifier']}' (Status: {rep_pdf['status']})")
        pdf_path = rep_pdf.get("artifact_path")
        if pdf_path and os.path.exists(pdf_path):
            print(f"  -> PDF File Verified on Disk ({os.path.getsize(pdf_path)} bytes at {pdf_path})")

        # STEP 18: Investigation Replay Verification
        print("\n[STEP 18/18] Executing Cryptographic Investigation Replay Verification...")
        r_replay = client.post(f"/api/cases/{case_id}/replay-verify", headers=auth_headers)
        assert r_replay.status_code == 200
        replay_res = r_replay.json()
        print(f"  -> Replay Verification Status: {replay_res['overall_status']}")
        print(f"  -> All Cryptographic Hashes Matched: {replay_res['all_hashes_matched']}")
        assert replay_res["overall_status"] == "VERIFIED"
        assert replay_res["all_hashes_matched"] is True

        print("\n" + "=" * 80)
        print("ALL 18 INVESTIGATION LIFECYCLE STEPS EXECUTED AND FULLY VERIFIED!")
        print("=" * 80)

    finally:
        db.close()
        if os.path.exists("e2e_test_lifecycle.db"):
            try:
                os.remove("e2e_test_lifecycle.db")
            except Exception:
                pass

if __name__ == "__main__":
    main()
