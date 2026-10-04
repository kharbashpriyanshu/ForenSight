# ForenSight PRNU Sensor Attribution & Camera Identification Protocol v1.0.0

## 1. Overview
Photo-Response Non-Uniformity (PRNU) represents the persistent microscopic hardware fingerprint of a digital imaging sensor. 

The **ForenSight PRNU Validation Protocol** systematically validates the discrimination capability of ForenSight's PRNU engine under controlled multi-camera conditions.

---

## 2. Methodology & Multi-Camera Setup

### 2.1 Sensor Fingerprint Synthesis
- Two distinct synthetic camera sensors are modeled: **Camera A** and **Camera B**.
- Each sensor possesses an independent zero-mean, unit-variance high-frequency noise matrix representing silicon substrate imperfections.

### 2.2 Reference Fingerprint Aggregation
- For each camera, 4 independent reference frames are synthesized under varied scene content.
- Wavelet / Wiener denoising residuals are extracted for each frame.
- The Maximum Likelihood Estimator (MLE) computes the reference sensor fingerprint $K$:
  $$K = \frac{\sum_{i=1}^N W_i \cdot I_i}{\sum_{i=1}^N I_i^2 + \epsilon}$$
- The aggregated fingerprint is zero-mean normalized.

---

## 3. Evaluation & Peak-to-Correlation Energy (PCE)
Query probe images from Camera A and Camera B are tested against Camera A's reference fingerprint:
1. **Normalized 2D Cross-Correlation**:
   $$\gamma(s_1, s_2) = \frac{\sum (W(x, y) - \bar{W}) (K(x+s_1, y+s_2) - \bar{K})}{\|W - \bar{W}\| \|K - \bar{K}\|}$$
2. **Peak-to-Correlation Energy (PCE)**:
   $$\text{PCE} = \frac{\gamma(s_{peak})^2}{\frac{1}{|A| - |\Omega|} \sum_{s \notin \Omega} \gamma(s)^2}$$
   where $\Omega$ represents an $11 \times 11$ exclusion neighborhood around the correlation peak.

---

## 4. Separation Gap & Metrics
- **Same-Camera Probe Distribution**: Evaluates queries originating from Camera A against Camera A's reference. Mean PCE $\ge 20.0$.
- **Different-Camera Probe Distribution**: Evaluates queries originating from Camera B against Camera A's reference. Mean PCE $\le 17.0$.
- **PCE Separation Gap**:
  $$\Delta_{\text{PCE}} = \min(\text{PCE}_{\text{same}}) - \max(\text{PCE}_{\text{diff}})$$
  Measures the decision margin for cross-camera attribution.
