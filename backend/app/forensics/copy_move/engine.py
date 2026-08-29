import os
import uuid
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
            # Draw the lines connecting the duplicated regions within the same image
            vis_img = cv2.drawMatches(
                img, keypoints, img, keypoints, inlier_matches, None,
                matchColor=(0, 255, 0), singlePointColor=(0, 0, 255),
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            
            run_id = uuid.uuid4().hex[:8]
            os.makedirs(output_dir, exist_ok=True)
            vis_path = os.path.join(output_dir, f"copymove_map_{run_id}.jpg")
            cv2.imwrite(vis_path, vis_img)
            
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
                visualization_artifact_path=vis_path
            )
            
        except ImageProcessingError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"Copy-Move processing failed: {str(e)}")

    @staticmethod
    def _empty_result(img, output_dir, ratio_thresh, spatial_dist, ransac_thresh):
        h, w = img.shape[:2]
        
        run_id = uuid.uuid4().hex[:8]
        os.makedirs(output_dir, exist_ok=True)
        vis_path = os.path.join(output_dir, f"copymove_map_{run_id}.jpg")
        cv2.imwrite(vis_path, img) # Just save original as map since no matches
        
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
            visualization_artifact_path=vis_path
        )
