# Classical Copy-Move Detection

## What is Copy-Move Manipulation?
Copy-Move manipulation occurs when a region of an image is duplicated and pasted elsewhere within the same image. This is often done to hide objects (e.g. copying background foliage over a person) or to clone objects (e.g. copying a vehicle to make a crowd look larger).

## Feature-Based Detection Pipeline
ForenSight uses a classical computer-vision feature-based approach to detect these duplicated regions.

### 1. Feature Detection & Description
The image is converted to grayscale, and the **SIFT (Scale-Invariant Feature Transform)** algorithm is applied. SIFT identifies structurally interesting points ("keypoints") such as corners and edges. It then calculates a 128-dimensional mathematical "descriptor" for each point that uniquely describes the local gradient texture. SIFT is highly robust to scale and rotation.

### 2. Same-Image Matching
To find duplicates, we compare every descriptor in the image against every other descriptor in the same image using an L2 (Euclidean) distance metric. We use a K-Nearest Neighbors (KNN) search with $k=3$. The nearest neighbor ($k=1$) is always the keypoint itself (distance of 0). The actual matches are the second and third closest descriptors.

### 3. Ratio Filtering
We apply Lowe's Distance Ratio test. A match is only considered valid if the best match distance is significantly smaller than the second-best match distance (e.g. `ratio = 0.75`). This eliminates ambiguous features that look similar to many other parts of the image.

### 4. Spatial Separation
Copy-Move manipulation inherently involves moving the copy. Matches that are physically too close to each other (e.g. within 30 pixels) are often just overlapping features on the same object and are discarded.

### 5. Geometric Verification (RANSAC)
Individual feature matches can be coincidental. Real copy-move operations move entire patches of pixels together. We apply **RANSAC (Random Sample Consensus)** to estimate a 2D Affine transformation matrix between the source points and destination points. 
If the matched features mathematically align according to a rigid geometric transformation, they are classified as **Geometric Inliers**. A high number of inliers strongly suggests a duplicated region.

## Candidate Region Estimation
Once inliers are confirmed, ForenSight calculates the spatial centroids of the source and destination clusters and estimates their bounding boxes and overall displacement vector.

## Visualization
ForenSight generates a visualization drawing lines between the matching inlier keypoints, mapping the exact structural correspondence between the duplicated regions.

## False Positives and Limitations
**A detected geometric correspondence does NOT prove malicious manipulation.**
Natural images contain many genuinely duplicated patterns:
- Architectural structures (windows, bricks, tiles)
- Nature (identical leaves, symmetrical flowers)
- Text and typography
- Intentional reflections (water, mirrors)

Therefore, this engine identifies **Candidate Copy-Move Correspondences**. These findings must be evaluated by a human analyst or correlated with other forensic indicators (like ELA or Noise) to form a final verdict.
