import pytest
from app.models.domain import (
    User,
    InvestigationCase,
    Evidence,
    AnalysisJob,
    Analysis,
    EvidenceObservation,
    EvidenceRelation,
    EvidenceLineageRelation,
    Finding,
    Report,
)
from app.services.graph import GraphService
from tests.conftest import TestingSessionLocal


@pytest.fixture
def graph_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _create_user_and_case(db, username: str, title: str):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = User(username=username, hashed_password="hashed-test-password", role="INVESTIGATOR")
        db.add(user)
        db.commit()
        db.refresh(user)
    case = InvestigationCase(title=title, user_id=user.id, status="Open")
    db.add(case)
    db.commit()
    db.refresh(case)
    return user, case


def _create_evidence(db, case_id: int, filename: str, sha_char: str):
    ev = Evidence(
        case_id=case_id,
        original_filename=filename,
        stored_path=f"storage/evidence/{filename}",
        sha256_hash=sha_char * 64,
        mime_type="image/jpeg",
        image_format="JPEG",
        file_size=1024,
        width=300,
        height=300,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_empty_case_returns_single_case_node_and_zero_edges(graph_db):
    _, case = _create_user_and_case(graph_db, "graph_empty_user", "Empty Graph Case")
    graph = GraphService.get_case_observation_graph(graph_db, case)
    assert graph["case_id"] == case.case_identifier
    assert len(graph["nodes"]) == 1
    assert graph["nodes"][0]["type"] == "CASE"
    assert graph["nodes"][0]["id"] == f"case:{case.case_identifier}"
    assert graph["edges"] == []


def test_case_with_evidence_emits_contains_edges(graph_db):
    _, case = _create_user_and_case(graph_db, "graph_ev_user", "Evidence Graph Case")
    ev1 = _create_evidence(graph_db, case.id, "img1.jpg", "1")
    ev2 = _create_evidence(graph_db, case.id, "img2.jpg", "2")

    graph = GraphService.get_case_observation_graph(graph_db, case)
    node_ids = {n["id"] for n in graph["nodes"]}
    assert f"ev:{ev1.id}" in node_ids
    assert f"ev:{ev2.id}" in node_ids
    contains_edges = [e for e in graph["edges"] if e["type"] == "CONTAINS"]
    assert len(contains_edges) == 2
    assert {"source": f"case:{case.case_identifier}", "target": f"ev:{ev1.id}", "type": "CONTAINS"} in contains_edges
    assert {"source": f"case:{case.case_identifier}", "target": f"ev:{ev2.id}", "type": "CONTAINS"} in contains_edges


def test_evidence_with_analysis_findings_and_report_relationships(graph_db):
    _, case = _create_user_and_case(graph_db, "graph_full_user", "Full Graph Case")
    ev = _create_evidence(graph_db, case.id, "analyzed.jpg", "a")

    job = AnalysisJob(evidence_id=ev.id, analysis_type="ela", status="COMPLETED")
    graph_db.add(job)
    analysis = Analysis(
        evidence_id=ev.id,
        analysis_type="ela",
        status="completed",
        summary="ELA completed",
        structured_findings={"artifacts": {"heatmap": "storage/evidence/ela_map.png"}},
    )
    graph_db.add(analysis)
    graph_db.commit()
    graph_db.refresh(job)
    graph_db.refresh(analysis)

    obs = EvidenceObservation(
        evidence_id=ev.id,
        analysis_id=analysis.id,
        modality="ela",
        observation_type="ERROR_SURFACE",
        metric_name="mean_ela",
        raw_value="0.42",
        direction="ELEVATED",
        technical_reliability="HIGH",
        interpretation="Elevated error level",
        limitations="High-contrast edges",
    )
    graph_db.add(obs)
    finding = Finding(
        case_id=case.case_identifier,
        evidence_id=ev.id,
        finding_type="CORRELATION",
        severity_label="HIGH",
        title="Localized ELA Elevation",
        summary="Summary",
        supporting_analysis_ids=[analysis.id],
    )
    graph_db.add(finding)
    report = Report(
        case_id=case.case_identifier,
        report_type="PDF",
        status="COMPLETED",
        rule_version="1.0",
    )
    graph_db.add(report)
    graph_db.commit()
    graph_db.refresh(obs)
    graph_db.refresh(finding)
    graph_db.refresh(report)

    graph = GraphService.get_case_observation_graph(graph_db, case)
    edges = {(e["source"], e["target"], e["type"]) for e in graph["edges"]}
    assert (f"case:{case.case_identifier}", f"ev:{ev.id}", "CONTAINS") in edges
    assert (f"ev:{ev.id}", f"job:{job.id}", "ANALYZED_BY") in edges
    assert (f"ev:{ev.id}", f"anl:{analysis.id}", "PRODUCED") in edges
    assert (f"anl:{analysis.id}", f"art:{analysis.id}:heatmap", "GENERATED") in edges
    assert (f"anl:{analysis.id}", f"obs:{obs.id}", "PRODUCED") in edges
    assert (f"ev:{ev.id}", f"fnd:{finding.id}", "SUPPORTS") in edges
    assert (f"anl:{analysis.id}", f"fnd:{finding.id}", "SUPPORTS") in edges
    assert (f"case:{case.case_identifier}", f"rpt:{report.id}", "GENERATED") in edges


def test_evidence_lineage_directed_edges(graph_db):
    _, case = _create_user_and_case(graph_db, "graph_lin_user", "Lineage Graph Case")
    parent_ev = _create_evidence(graph_db, case.id, "original.jpg", "b")
    child_ev = _create_evidence(graph_db, case.id, "derived.jpg", "c")
    sibling_ev = _create_evidence(graph_db, case.id, "candidate.jpg", "d")

    rel_derived = EvidenceLineageRelation(
        case_id=case.id,
        evidence_a_id=parent_ev.id,
        evidence_b_id=child_ev.id,
        relation_kind="DERIVED_FROM",
        parent_evidence_id=parent_ev.id,
        review_status="CONFIRMED",
    )
    rel_candidate = EvidenceLineageRelation(
        case_id=case.id,
        evidence_a_id=parent_ev.id,
        evidence_b_id=sibling_ev.id,
        relation_kind="CANDIDATE_LINEAGE",
        parent_evidence_id=None,
        review_status="CANDIDATE",
    )
    graph_db.add_all([rel_derived, rel_candidate])
    graph_db.commit()

    graph = GraphService.get_case_observation_graph(graph_db, case)
    edges = {(e["source"], e["target"], e["type"]) for e in graph["edges"]}
    assert (f"ev:{child_ev.id}", f"ev:{parent_ev.id}", "DERIVED_FROM") in edges
    assert (f"ev:{parent_ev.id}", f"ev:{sibling_ev.id}", "CANDIDATE_LINEAGE") in edges


def test_observation_relations_supports_and_contradicts(graph_db):
    _, case = _create_user_and_case(graph_db, "graph_obs_user", "Observation Rel Case")
    ev = _create_evidence(graph_db, case.id, "obs_rel.jpg", "e")
    anl = Analysis(evidence_id=ev.id, analysis_type="noise", status="completed")
    graph_db.add(anl)
    graph_db.commit()
    graph_db.refresh(anl)

    obs1 = EvidenceObservation(evidence_id=ev.id, analysis_id=anl.id, modality="ela", observation_type="A", metric_name="m1", raw_value="1")
    obs2 = EvidenceObservation(evidence_id=ev.id, analysis_id=anl.id, modality="noise", observation_type="B", metric_name="m2", raw_value="2")
    obs3 = EvidenceObservation(evidence_id=ev.id, analysis_id=anl.id, modality="jpeg_dct", observation_type="C", metric_name="m3", raw_value="3")
    graph_db.add_all([obs1, obs2, obs3])
    graph_db.commit()
    graph_db.refresh(obs1)
    graph_db.refresh(obs2)
    graph_db.refresh(obs3)

    rel_sup = EvidenceRelation(evidence_id=ev.id, observation_a_id=obs1.id, observation_b_id=obs2.id, relation_type="SUPPORTING", strength="HIGH")
    rel_con = EvidenceRelation(evidence_id=ev.id, observation_a_id=obs1.id, observation_b_id=obs3.id, relation_type="CONTRASTING", strength="MODERATE")
    graph_db.add_all([rel_sup, rel_con])
    graph_db.commit()

    graph = GraphService.get_case_observation_graph(graph_db, case)
    edges = {(e["source"], e["target"], e["type"]) for e in graph["edges"]}
    assert (f"obs:{obs1.id}", f"obs:{obs2.id}", "SUPPORTS") in edges
    assert (f"obs:{obs1.id}", f"obs:{obs3.id}", "CONTRADICTS") in edges


def test_absent_endpoint_cross_case_and_duplicate_edges_excluded(graph_db):
    _, case_a = _create_user_and_case(graph_db, "graph_iso_a", "Isolation Case A")
    _, case_b = _create_user_and_case(graph_db, "graph_iso_b", "Isolation Case B")

    ev_a1 = _create_evidence(graph_db, case_a.id, "a1.jpg", "f")
    ev_a2 = _create_evidence(graph_db, case_a.id, "a2.jpg", "0")
    ev_b1 = _create_evidence(graph_db, case_b.id, "b1.jpg", "9")

    anl_a = Analysis(evidence_id=ev_a1.id, analysis_type="ela", status="completed")
    anl_b = Analysis(evidence_id=ev_b1.id, analysis_type="ela", status="completed")
    graph_db.add_all([anl_a, anl_b])
    graph_db.commit()
    graph_db.refresh(anl_a)
    graph_db.refresh(anl_b)

    obs_a1 = EvidenceObservation(evidence_id=ev_a1.id, analysis_id=anl_a.id, modality="ela", observation_type="A", metric_name="m1", raw_value="1")
    obs_a2 = EvidenceObservation(evidence_id=ev_a1.id, analysis_id=anl_a.id, modality="noise", observation_type="B", metric_name="m2", raw_value="2")
    obs_b1 = EvidenceObservation(evidence_id=ev_b1.id, analysis_id=anl_b.id, modality="ela", observation_type="X", metric_name="mx", raw_value="9")
    graph_db.add_all([obs_a1, obs_a2, obs_b1])
    graph_db.commit()
    graph_db.refresh(obs_a1)
    graph_db.refresh(obs_a2)
    graph_db.refresh(obs_b1)

    # 1. Dangling lineage endpoint (999999 does not exist)
    dangling_lin = EvidenceLineageRelation(
        case_id=case_a.id,
        evidence_a_id=ev_a1.id,
        evidence_b_id=999999,
        relation_kind="CANDIDATE_LINEAGE",
    )
    # 2. Cross-case lineage record belonging to case_b
    cross_lin = EvidenceLineageRelation(
        case_id=case_b.id,
        evidence_a_id=ev_a1.id,
        evidence_b_id=ev_b1.id,
        relation_kind="CANDIDATE_LINEAGE",
    )
    # 3. Dangling observation relation & cross-case observation relation
    dangling_obs = EvidenceRelation(evidence_id=ev_a1.id, observation_a_id=obs_a1.id, observation_b_id=999999, relation_type="SUPPORTS")
    cross_obs = EvidenceRelation(evidence_id=ev_a1.id, observation_a_id=obs_a1.id, observation_b_id=obs_b1.id, relation_type="SUPPORTS")
    # 4. Duplicate observation relations
    dup_obs_1 = EvidenceRelation(evidence_id=ev_a1.id, observation_a_id=obs_a1.id, observation_b_id=obs_a2.id, relation_type="SUPPORTING")
    dup_obs_2 = EvidenceRelation(evidence_id=ev_a1.id, observation_a_id=obs_a1.id, observation_b_id=obs_a2.id, relation_type="SUPPORTS")
    # Valid lineage between ev_a1 and ev_a2
    valid_lin = EvidenceLineageRelation(
        case_id=case_a.id,
        evidence_a_id=ev_a1.id,
        evidence_b_id=ev_a2.id,
        relation_kind="CANDIDATE_LINEAGE",
    )
    graph_db.add_all([dangling_lin, cross_lin, dangling_obs, cross_obs, dup_obs_1, dup_obs_2, valid_lin])
    graph_db.commit()

    graph = GraphService.get_case_observation_graph(graph_db, case_a)
    node_ids = {n["id"] for n in graph["nodes"]}
    assert f"ev:{ev_b1.id}" not in node_ids
    assert f"obs:{obs_b1.id}" not in node_ids

    # Every edge must connect two nodes present in the graph
    for edge in graph["edges"]:
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids

    # Duplicate SUPPORTS edge between obs_a1 and obs_a2 must appear only once
    sup_edges = [
        e for e in graph["edges"]
        if e["source"] == f"obs:{obs_a1.id}" and e["target"] == f"obs:{obs_a2.id}" and e["type"] == "SUPPORTS"
    ]
    assert len(sup_edges) == 1

