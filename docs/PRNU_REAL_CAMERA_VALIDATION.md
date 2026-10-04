# ForenSight V4 — Real-Camera PRNU Empirical Validation Protocol

## 1. Overview & Separation from Synthetic PRNU
ForenSight maintains two strictly independent PRNU validation protocols:
1. **Synthetic PRNU (`PRNUBenchmarkProtocol`)**: Evaluates algorithmic sensitivity against simulated sensor fingerprints with mathematically controlled noise variances and known ground truth.
2. **Real-Camera PRNU (`RealCameraPRNUProtocol`)**: Evaluates forensic attribution against genuine physical digital camera hardware using multi-image reference extraction and empirical processing sweeps.

---

## 2. Multi-Reference MLE Fingerprint Estimation
Following the foundational methodology of Lukas, Fridrich, and Goljan (2006):
For $K$ reference images $I^{(1)}, \dots, I^{(K)}$ captured by physical camera $C$, high-frequency noise residuals $W^{(k)} = I^{(k)} - F(I^{(k)})$ are computed using spatial Mihcak wavelets or high-pass filtering.

The maximum-likelihood estimator (MLE) accumulates the device fingerprint:
$$\hat{K} = \frac{\sum_{k=1}^K W^{(k)} I^{(k)}}{\sum_{k=1}^K (I^{(k)})^2}$$

To avoid scene detail leakage, reference images must be flat or minimally textured (e.g. out-of-focus gray cards or clear sky).

---

## 3. Probe Attribution & Peak-to-Correlation Energy (PCE)
When testing a query probe image $I_{\text{probe}}$, its noise residual $W_{\text{probe}}$ is cross-correlated with the reference fingerprint $\hat{K}$.

The Peak-to-Correlation Energy (PCE) metric measures attribution confidence:
$$\text{PCE} = \frac{C(s_{\text{peak}})^2}{\frac{1}{N - |\mathcal{N}|} \sum_{s \notin \mathcal{N}} C(s)^2}$$
where $\mathcal{N}$ represents a small neighborhood around the peak correlation coordinate.

---

## 4. Processing Sensitivity Sweep
Real-world forensic investigations encounter degraded imagery. The protocol sweeps query probes across standard post-processing degradations to evaluate fingerprint degradation boundaries:
- **Pristine Original**: Full uncompressed or camera-native probe.
- **JPEG Recompression**: Quality factors Q95, Q85, and Q70.
- **Geometric Resampling**: Bicubic downscaling (0.8x) and upscaling (1.2x).
- **Spatial Cropping**: Central 50% spatial crop.

The protocol outputs the PCE degradation curve across all processing conditions, documenting empirical degradation thresholds.
