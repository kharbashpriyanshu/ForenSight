import os
import uuid
import math
from typing import List, Optional
import cv2
import numpy as np
from .schemas import (
    CopyMoveResult, DetectionConfig, ImageInfo, FeatureStatistics,
    MatchingStatistics, Geometry, CandidateRegions
)
from .exceptions import ImageProcessingError

class CopyMoveEngine:
    @staticmethod
    def run(input_path: str, output_dir: str,
            ratio_threshold: float = 0.75, 
            min_spatial_dist: float = 30.0,
            ransac_threshold: float = 5.0,
            max_features: int = 5000) -> CopyMoveResult:
            
        try:
            # 1. Load Image
            img = cv2.imread(input_path)
            if img is None:
                raise ImageProcessingError("Could not read image or format is unsupported.")
                
            height, width = img.shape[:2]
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # 2. Extract Features using SIFT
            # SIFT is scale/rotation invariant, making it robust for copy-move patches.
            sift = cv2.SIFT_create(nfeatures=max_features)
            keypoints, descriptors = sift.detectAndCompute(gray, None)
            
            num_keypoints = len(keypoints) if keypoints is not None else 0
            num_descriptors = len(descriptors) if descriptors is not None else 0
            
            if num_descriptors < 10:
                # Not enough features to match
                return CopyMoveEngine._empty_result(img, output_dir, ratio_threshold, min_spatial_dist, ransac_threshold)

            # 3. Descriptor Matching (Self-Match Filtering)
            # Find 3 nearest neighbors because the closest will always be the exact same keypoint (dist 0)
            bf = cv2.BFMatcher(cv2.NORM_L2)
            raw_knn_matches = bf.knnMatch(descriptors, descriptors, k=3)
            
            ratio_passed = []
            spatially_passed = []
            
            for match_tuple in raw_knn_matches:
                if len(match_tuple) < 3:
                    continue
                
                m1, m2, m3 = match_tuple
                
                # Identify the actual matches by skipping the identical self-match
                if m1.queryIdx == m1.trainIdx:
                    best = m2
                    second = m3
                else:
                    best = m1
                    second = m2
                    
                # Distance Ratio Test
                if best.distance < ratio_threshold * second.distance:
                    ratio_passed.append(best)
                    
                    # Spatial Separation Test
                    pt1 = np.array(keypoints[best.queryIdx].pt)
                    pt2 = np.array(keypoints[best.trainIdx].pt)
                    dist = np.linalg.norm(pt1 - pt2)
                    
                    if dist >= min_spatial_dist:
                        spatially_passed.append(best)
            
            # Deduplicate symmetric matches (A->B and B->A)
            unique_matches = []
            seen = set()
            for m in spatially_passed:
                pair = tuple(sorted((m.queryIdx, m.trainIdx)))
                if pair not in seen:
                    seen.add(pair)
                    unique_matches.append(m)

            # 4. Geometric Verification (RANSAC)
            inlier_matches = []
            transform_matrix = None
            src_centroid = None
            dst_centroid = None
            displacement = None
            src_bbox = None
            dst_bbox = None
            
            if len(unique_matches) >= 4:
                src_pts = np.float32([keypoints[m.queryIdx].pt for m in unique_matches]).reshape(-1, 1, 2)
                dst_pts = np.float32([keypoints[m.trainIdx].pt for m in unique_matches]).reshape(-1, 1, 2)
                
                # Estimate Affine Transform to capture translation, rotation, and scaling while being robust to perspective distortion
                M, mask = cv2.estimateAffinePartial2D(src_pts, dst_pts, method=cv2.RANSAC, ransacReprojThreshold=ransac_threshold)
                
                if mask is not None:
                    mask_flat = mask.ravel().tolist()
                    for i, is_inlier in enumerate(mask_flat):
                        if is_inlier:
                            inlier_matches.append(unique_matches[i])
                            
                if M is not None and len(inlier_matches) >= 4:
                    transform_matrix = M.tolist()
                    
                    src_inliers = np.float32([keypoints[m.queryIdx].pt for m in inlier_matches])
                    dst_inliers = np.float32([keypoints[m.trainIdx].pt for m in inlier_matches])
                    
                    src_centroid = np.mean(src_inliers, axis=0).tolist()
                    dst_centroid = np.mean(dst_inliers, axis=0).tolist()
                    displacement = (np.array(dst_centroid) - np.array(src_centroid)).tolist()
                    
                    # Bounding regions (x, y, w, h)
                    sx, sy, sw, sh = cv2.boundingRect(src_inliers)
                    dx, dy, dw, dh = cv2.boundingRect(dst_inliers)
                    src_bbox = [float(sx), float(sy), float(sw), float(sh)]
                    dst_bbox = [float(dx), float(dy), float(dw), float(dh)]

            inlier_ratio = len(inlier_matches) / len(unique_matches) if unique_matches else 0.0

            # 5. Visualization
            # Primary diagnostic artifact: Single-frame coordinate overlay on native image dimensions (W x H)
            vis_overlay = CopyMoveEngine._render_single_frame_overlay(
                img=img,
                keypoints=keypoints,
                inlier_matches=inlier_matches,
                src_bbox=src_bbox,
                dst_bbox=dst_bbox,
                src_centroid=src_centroid,
                dst_centroid=dst_centroid,
            )

            run_id = uuid.uuid4().hex[:8]
            os.makedirs(output_dir, exist_ok=True)
            vis_path = os.path.join(output_dir, f"copymove_map_{run_id}.png")
            cv2.imwrite(vis_path, vis_overlay)

            # Secondary diagnostic artifact: Side-by-side match visualization for debugging (2W x H)
            vis_sbs = cv2.drawMatches(
                img, keypoints, img, keypoints, inlier_matches, None,
                matchColor=(0, 255, 0), singlePointColor=(0, 0, 255),
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            vis_sbs_path = os.path.join(output_dir, f"copymove_side_by_side_{run_id}.png")
            cv2.imwrite(vis_sbs_path, vis_sbs)

            return CopyMoveResult(
                config=DetectionConfig(
                    detector="SIFT",
                    descriptor_type="float32",
                    matching_metric="L2",
                    ratio_threshold=ratio_threshold,
                    min_spatial_separation=min_spatial_dist,
                    ransac_threshold=ransac_threshold
                ),
                image_info=ImageInfo(width=width, height=height),
                feature_statistics=FeatureStatistics(
                    keypoints_detected=num_keypoints,
                    descriptors_generated=num_descriptors
                ),
                matching_statistics=MatchingStatistics(
                    raw_matches=len(raw_knn_matches),
                    ratio_filtered_matches=len(ratio_passed),
                    spatially_filtered_matches=len(unique_matches),
                    geometric_inliers=len(inlier_matches),
                    inlier_ratio=inlier_ratio
                ),
                geometry=Geometry(
                    transformation_type="AffinePartial2D",
                    transformation_matrix=transform_matrix,
                    source_centroid=src_centroid,
                    destination_centroid=dst_centroid,
                    displacement=displacement
                ),
                candidate_regions=CandidateRegions(
                    source_bounding_box=src_bbox,
                    destination_bounding_box=dst_bbox,
                    supporting_matches=len(inlier_matches)
                ),
                visualization_artifact_path=vis_path,
                side_by_side_artifact_path=vis_sbs_path
            )
            
        except ImageProcessingError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"Copy-Move processing failed: {str(e)}")

    @staticmethod
    def _render_single_frame_overlay(
        img: np.ndarray,
        keypoints: List[cv2.KeyPoint],
        inlier_matches: List[cv2.DMatch],
        src_bbox: Optional[List[float]],
        dst_bbox: Optional[List[float]],
        src_centroid: Optional[List[float]],
        dst_centroid: Optional[List[float]],
    ) -> np.ndarray:
        """
        Renders a single-frame coordinate overlay on native image dimensions (W x H).
        Plots source and destination bounding boxes, inlier correspondences, and
        directional displacement arrow without modifying original image bytes or resizing.
        """
        overlay = img.copy()
        h, w = overlay.shape[:2]

        if not inlier_matches or src_bbox is None or dst_bbox is None:
            return overlay

        # 1. Draw inlier keypoint correspondences (subtle connection lines and markers)
        for m in inlier_matches:
            x1 = int(round(np.clip(keypoints[m.queryIdx].pt[0], 0, w - 1)))
            y1 = int(round(np.clip(keypoints[m.queryIdx].pt[1], 0, h - 1)))
            x2 = int(round(np.clip(keypoints[m.trainIdx].pt[0], 0, w - 1)))
            y2 = int(round(np.clip(keypoints[m.trainIdx].pt[1], 0, h - 1)))

            cv2.line(overlay, (x1, y1), (x2, y2), (180, 180, 180), 1, cv2.LINE_AA)
            cv2.circle(overlay, (x1, y1), 3, (255, 180, 0), -1, cv2.LINE_AA)
            cv2.circle(overlay, (x2, y2), 3, (0, 80, 255), -1, cv2.LINE_AA)

        # 2. Draw Source Bounding Box (Cyan/Blue: (255, 180, 0) BGR)
        sx, sy, sw, sh = src_bbox
        x1_s = int(round(np.clip(sx, 0, w - 1)))
        y1_s = int(round(np.clip(sy, 0, h - 1)))
        x2_s = int(round(np.clip(sx + sw, 0, w - 1)))
        y2_s = int(round(np.clip(sy + sh, 0, h - 1)))

        if x2_s > x1_s and y2_s > y1_s:
            cv2.rectangle(overlay, (x1_s, y1_s), (x2_s, y2_s), (255, 180, 0), 2, cv2.LINE_AA)
            s_label = "SRC"
            (lw, lh), _ = cv2.getTextSize(s_label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            by1 = max(0, y1_s - lh - 4)
            cv2.rectangle(overlay, (x1_s, by1), (x1_s + lw + 4, y1_s), (255, 180, 0), -1)
            cv2.putText(overlay, s_label, (x1_s + 2, y1_s - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)

        # 3. Draw Destination Bounding Box (Orange/Red: (0, 80, 255) BGR)
        dx, dy, dw, dh = dst_bbox
        x1_d = int(round(np.clip(dx, 0, w - 1)))
        y1_d = int(round(np.clip(dy, 0, h - 1)))
        x2_d = int(round(np.clip(dx + dw, 0, w - 1)))
        y2_d = int(round(np.clip(dy + dh, 0, h - 1)))

        if x2_d > x1_d and y2_d > y1_d:
            cv2.rectangle(overlay, (x1_d, y1_d), (x2_d, y2_d), (0, 80, 255), 2, cv2.LINE_AA)
            d_label = "CLONE"
            (dlw, dlh), _ = cv2.getTextSize(d_label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            d_by1 = max(0, y1_d - dlh - 4)
            cv2.rectangle(overlay, (x1_d, d_by1), (x1_d + dlw + 4, y1_d), (0, 80, 255), -1)
            cv2.putText(overlay, d_label, (x1_d + 2, y1_d - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

        # 4. Draw Directional Displacement Arrow connecting centroids
        if src_centroid is not None and dst_centroid is not None:
            c1 = (int(round(np.clip(src_centroid[0], 0, w - 1))), int(round(np.clip(src_centroid[1], 0, h - 1))))
            c2 = (int(round(np.clip(dst_centroid[0], 0, w - 1))), int(round(np.clip(dst_centroid[1], 0, h - 1))))
            cv2.drawMarker(overlay, c1, (255, 200, 0), cv2.MARKER_CROSS, 8, 2, cv2.LINE_AA)
            cv2.drawMarker(overlay, c2, (0, 80, 255), cv2.MARKER_CROSS, 8, 2, cv2.LINE_AA)
            disp_dist = math.hypot(c2[0] - c1[0], c2[1] - c1[1])
            if disp_dist > 5.0:
                cv2.arrowedLine(overlay, c1, c2, (0, 255, 0), 2, cv2.LINE_AA, tipLength=min(0.25, 20.0 / disp_dist))

        return overlay

    @staticmethod
    def _empty_result(img, output_dir, ratio_thresh, spatial_dist, ransac_thresh):
        h, w = img.shape[:2]
        
        run_id = uuid.uuid4().hex[:8]
        os.makedirs(output_dir, exist_ok=True)
        vis_path = os.path.join(output_dir, f"copymove_map_{run_id}.png")
        cv2.imwrite(vis_path, img) # Single-frame clean image
        
        vis_sbs_path = os.path.join(output_dir, f"copymove_side_by_side_{run_id}.png")
        sbs_empty = np.hstack([img, img])
        cv2.imwrite(vis_sbs_path, sbs_empty)
        
        return CopyMoveResult(
            config=DetectionConfig(
                detector="SIFT",
                descriptor_type="float32",
                matching_metric="L2",
                ratio_threshold=ratio_thresh,
                min_spatial_separation=spatial_dist,
                ransac_threshold=ransac_thresh
            ),
            image_info=ImageInfo(width=w, height=h),
            feature_statistics=FeatureStatistics(keypoints_detected=0, descriptors_generated=0),
            matching_statistics=MatchingStatistics(
                raw_matches=0, ratio_filtered_matches=0, spatially_filtered_matches=0,
                geometric_inliers=0, inlier_ratio=0.0
            ),
            geometry=Geometry(
                transformation_type="AffinePartial2D", transformation_matrix=None,
                source_centroid=None, destination_centroid=None, displacement=None
            ),
            candidate_regions=CandidateRegions(
                source_bounding_box=None, destination_bounding_box=None, supporting_matches=0
            ),
            visualization_artifact_path=vis_path,
            side_by_side_artifact_path=vis_sbs_path
        )
