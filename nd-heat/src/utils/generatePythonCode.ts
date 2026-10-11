export function generatePythonCode(params: {
  xAxis: string;
  yAxis: string;
  zAxis: string;
  filters: Record<string, number>;
  activeFilters: Record<string, boolean>;
  dimensionUniqueValues: Record<string, any[]>;
  titleInput: string;
  xTitleInput: string;
  yTitleInput: string;
  zTitleInput: string;
  colormap: string;
  smoothHeatmap: boolean;
  colorLimits: { finalZMin: number; finalZMax: number };
  filename?: string;
  showContours?: boolean;
  contourLevels?: number;
  showContourLabels?: boolean;
  selectedPoint?: { x: number; y: number } | null;
  cutAxis?: "horizontal" | "vertical";
}): string {
  const {
    xAxis,
    yAxis,
    zAxis,
    filters,
    activeFilters,
    dimensionUniqueValues,
    titleInput,
    xTitleInput,
    yTitleInput,
    zTitleInput,
    colormap,
    smoothHeatmap,
    colorLimits,
    filename = "simulation_sweep_data.csv",
    showContours = false,
    contourLevels = 8,
    showContourLabels = true,
    selectedPoint = null,
    cutAxis = "horizontal",
  } = params;

  const displayFilename = filename || "simulation_sweep_data.csv";

  const cmapMapping: Record<string, string> = {
    Viridis: "viridis",
    Plasma: "plasma",
    Inferno: "inferno",
    Magma: "magma",
    Cividis: "cividis",
    Turbo: "turbo",
    RdBu: "RdBu",
  };
  const pyCmap = cmapMapping[colormap] || "viridis";

  let pyFilters = "";
  Object.entries(activeFilters).forEach(([dim, isActive]) => {
    if (isActive) {
      const idx = filters[dim] ?? 0;
      const val = (dimensionUniqueValues[dim] || [])[idx];
      if (typeof val === "number") {
        pyFilters += `df = df[np.isclose(df['${dim}'], ${val}, atol=1e-6)]\n`;
      } else {
        pyFilters += `df = df[df['${dim}'] == '${val}']\n`;
      }
    }
  });

  const contourSnippet = showContours
    ? `
# 5b. Isolines / Contour Overlay
levels = np.linspace(${colorLimits.finalZMin.toFixed(6)}, ${colorLimits.finalZMax.toFixed(6)}, ${contourLevels})
contours = ax.contour(
    X, Y, Z,
    levels=levels,
    colors='white',
    linewidths=0.9,
    alpha=0.65
)
${
  showContourLabels
    ? "ax.clabel(contours, inline=True, fontsize=8, fmt='%.2f')"
    : "# Contour labels disabled"
}
`
    : "";

  let lineCutSnippet = "";
  if (selectedPoint) {
    const isHorizontal = cutAxis === "horizontal";
    const fixedVal = isHorizontal ? selectedPoint.y : selectedPoint.x;

    // Strip outer $ to prevent nested math environments
    const cleanYLabel = yTitleInput
      ? yTitleInput.replace(/^\$|\$$/g, "")
      : `\\text{${yAxis.replace(/_/g, " ")}}`;
    const cleanXLabel = xTitleInput
      ? xTitleInput.replace(/^\$|\$$/g, "")
      : `\\text{${xAxis.replace(/_/g, " ")}}`;

    lineCutSnippet = `
# -------------------------------------------------------------
# 9. 1D Cross-Section (Line Cut) Extraction
# -------------------------------------------------------------
fig_1d, ax_1d = plt.subplots(figsize=(6.5, 3.8), dpi=300)

${
  isHorizontal
    ? `# Cut along horizontal X at closest Y ~ ${fixedVal}
target_y = ${fixedVal}
closest_y_idx = np.argmin(np.abs(Y - target_y))
actual_y = Y[closest_y_idx]
x_profile = X
z_profile = Z[closest_y_idx, :]

ax_1d.plot(x_profile, z_profile, '-o', color='#4f46e5', markersize=4, linewidth=1.5)
ax_1d.set_title(r"1D Cross-Section Profile ($" + r"${cleanYLabel}" + r" = " + f"{actual_y:.4f}" + r"$)")
ax_1d.set_xlabel(r"${xTitleInput}")
ax_1d.set_ylabel(r"${zTitleInput}")`
    : `# Cut along vertical Y at closest X ~ ${fixedVal}
target_x = ${fixedVal}
closest_x_idx = np.argmin(np.abs(X - target_x))
actual_x = X[closest_x_idx]
y_profile = Y
z_profile = Z[:, closest_x_idx]

ax_1d.plot(y_profile, z_profile, '-o', color='#4f46e5', markersize=4, linewidth=1.5)
ax_1d.set_title(r"1D Cross-Section Profile ($" + r"${cleanXLabel}" + r" = " + f"{actual_x:.4f}" + r"$)")
ax_1d.set_xlabel(r"${yTitleInput}")
ax_1d.set_ylabel(r"${zTitleInput}")`
}

ax_1d.tick_params(which='both', direction='out', length=5, width=1.5, colors='black', top=True, right=True)
for spine in ax_1d.spines.values():
    spine.set_linewidth(1.5)
    spine.set_color('black')

plt.tight_layout()
plt.savefig("cross_section_1d.svg", format="svg", bbox_inches='tight')
print("Successfully generated 1D cross-section figure 'cross_section_1d.svg'.")
`;
  }

  return `# Place this script in the same folder as '${displayFilename}'
# or replace with the full file path (e.g., r"C:\\path\\to\\${displayFilename}")
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load the Sweep Dataset
df = pd.read_csv("${displayFilename}")

# 2. Apply Dynamic Slice Filters (Epsilon Snaps)
${pyFilters.trim() ? pyFilters.trim() : "# No active dimension filters applied"}

# 3. Pivot Coordinates to Grid Matrix (Averages duplicates if present)
df_grid = df.groupby(['${yAxis}', '${xAxis}'])['${zAxis}'].mean().reset_index()
df_pivot = df_grid.pivot(index='${yAxis}', columns='${xAxis}', values='${zAxis}')

X = df_pivot.columns.to_numpy()
Y = df_pivot.index.to_numpy()
Z = df_pivot.to_numpy()

# 4. Configure APS Journal Bounding Box & Typography Styles
plt.style.use('default')
plt.rcParams.update({
    "text.usetex": False,
    "mathtext.fontset": "cm",
    "font.family": "serif",
    "font.serif": ["DejaVu Serif", "Times New Roman", "serif"],
    "font.size": 11
})

fig, ax = plt.subplots(figsize=(7.5, 5.8), dpi=300)

# 5. Render Heatmap with pcolormesh
shading_mode = 'gouraud' if ${smoothHeatmap ? "True" : "False"} else 'auto'
im = ax.pcolormesh(
    X, Y, Z,
    cmap="${pyCmap}",
    shading=shading_mode,
    vmin=${colorLimits.finalZMin.toFixed(6)},
    vmax=${colorLimits.finalZMax.toFixed(6)}
)
${contourSnippet}
# 6. Apply Ticks & Boundary Borders
ax.set_aspect('auto')
ax.tick_params(which='both', direction='out', length=5, width=1.5, colors='black', top=True, right=True)
for spine in ax.spines.values():
    spine.set_linewidth(1.5)
    spine.set_color('black')

# 7. Apply LaTeX Axis Annotations
ax.set_title(r"${titleInput}")
ax.set_xlabel(r"${xTitleInput}")
ax.set_ylabel(r"${yTitleInput}")

# Add rotated vertical colorbar with padded margin labels
cbar = fig.colorbar(im, ax=ax, pad=0.03)
cbar.ax.tick_params(width=1.5, colors='black')
cbar.set_label(r"${zTitleInput}", labelpad=15)

plt.tight_layout()

# 8. Save Publication SVG image
plt.savefig("publication_figure.svg", format="svg", bbox_inches='tight')
print("Successfully generated Matplotlib figure 'publication_figure.svg' matching NDHeat layout.")
${lineCutSnippet}
plt.show()
`;
}