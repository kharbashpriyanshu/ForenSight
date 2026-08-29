# Noise Residual Analysis

## Image Noise Concept
In digital image processing, an observed image ($I$) can be modeled as the combination of an underlying image signal ($S$) and a high-frequency noise or residual component ($N$).
Mathematical model: $I = S + N$

The "noise" component in this context is not strictly digital sensor noise. It is a **residual**—the high-frequency information that remains when the low-frequency structure is subtracted.

## Low-Pass Filtering
To estimate the underlying signal ($S$), we apply a low-pass filter to the observed image. This effectively blurs the image, removing sharp edges and fine texture.
For our baseline implementation, we use a **Gaussian Filter** ($S_{hat} = Gaussian(I)$).
The Gaussian filter is parameterized by:
- **Kernel Size:** The spatial window (e.g., 5x5) over which pixels are averaged. It must be an odd integer.
- **Sigma ($\sigma$):** The standard deviation of the Gaussian distribution. Higher values result in stronger blurring.

## Residual Calculation
The residual ($R$) is calculated as the absolute difference between the original image and the smoothed estimate:
$R = | I - S_{hat} |$

### Numerical Representation
To perform this subtraction safely without integer underflow (e.g., an 8-bit unsigned integer wrapping $10 - 12$ to $254$), the image arrays are first converted to `float32` via NumPy. After the absolute difference is taken, the resulting residual array contains accurate continuous magnitudes.

### Signed vs Absolute Residual
Conceptually, the raw subtraction yields a **Signed Residual**:
$R_s = I - S_{hat}$
This signed matrix contains negative values where the smoothed signal overestimates the original image, and positive values where it underestimates.

However, for baseline forensic visualization and structural magnitude statistics, the system calculates the **Absolute Residual Magnitude**:
$R_{abs} = | I - S_{hat} |$
The current engine only exposes and visualizes $R_{abs}$. This design decision was made because absolute magnitude natively drives the visualization maps and directly correlates with structural complexity (edges/texture). Exposing signed residuals would require zero-point shifting (e.g., mapping 0 to 128 in an 8-bit space) which unnecessarily complicates visual interpretation for the baseline implementation.

## Grayscale Representation
For baseline noise mapping, the engine operates on Grayscale (Luminance) images. This simplifies the mathematical model and prevents color channel decoupling artifacts, yielding a unified map of structural high-frequency activity.

## Local Analysis
Global statistics (like mean residual) characterize the entire image. However, forensics often requires localizing anomalies. 
The engine divides the residual map into overlapping or non-overlapping grid windows (e.g., 16x16 pixels). Within each window, it aggregates the residual values (e.g., computing the Mean Absolute Residual). The result is a lower-resolution "local map" that highlights areas of concentrated high-frequency energy.

## Visualization
To allow human inspection, the raw residual arrays (which typically have very low dynamic ranges) are normalized. 
The visualization equation scales the maximum residual value to the maximum 8-bit visual bound:
$Normalized = R \times \frac{255}{\max(R)}$
The output is then safely cast to `uint8` for standard image generation.

## Scientific Limitations
**A high residual value does NOT prove image manipulation.**
Legitimate image properties that produce high residuals include:
- High-contrast edges (e.g., dark text on a white background).
- Natural textures (e.g., grass, sand, fabric).
- Artificial sharpening applied by the camera or user.
- High-frequency JPEG blocking artifacts.

The Noise Residual engine is an **observational tool**. It measures the distribution of high-frequency energy. Forensic analysts look for *inconsistencies* in the residual map (e.g., a completely smooth patch in the middle of a noisy sensor background) rather than simply flagging "high noise" as fake.

## Future Forensic Interpretation
In future sprints, this standalone statistical engine will be integrated into the Evidence Fusion platform. By comparing the local residual variance of suspected regions against the global background residual baseline, the system will probabilistically estimate the likelihood of localized tampering (such as splicing or region-smoothing).
