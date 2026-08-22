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
  filename: string;
}): string {
  const {
    xAxis, yAxis, zAxis, filters, activeFilters, dimensionUniqueValues,
    titleInput, xTitleInput, yTitleInput, zTitleInput, colormap,
    smoothHeatmap, colorLimits, filename
  } = params;

  const displayFilename = filename || 'simulation_sweep_data.csv';

  // Map colormaps to matplotlib equivalent names
  const cmapMapping: Record<string, string> = {
    'Viridis': 'viridis',
    'Plasma': 'plasma',
    'Inferno': 'inferno',
    'Magma': 'magma',
    'Cividis': 'cividis',
    'Turbo': 'turbo',
    'RdBu': 'RdBu'
  };
  const pyCmap = cmapMapping[colormap] || 'viridis';

  // Build dynamic pandas query filters snap snaps matching epsilon tolerance
  let pyFilters = '';
  Object.entries(activeFilters).forEach(([dim, isActive]) => {
    if (isActive) {
      const idx = filters[dim] ?? 0;
      const val = (dimensionUniqueValues[dim] || [])[idx];
      if (typeof val === 'number') {
        pyFilters += `df = df[np.isclose(df['${dim}'], ${val}, atol=1e-6)]\n`;
      } else {
        pyFilters += `df = df[df['${dim}'] == '${val}']\n`;
      }
    }
  });

  return `# Place this script in the same folder as '${displayFilename}'
# or replace with the full file path (e.g., r"C:\\path\\to\\${displayFilename}")
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load the Sweep Dataset
df = pd.read_csv("${displayFilename}")

# 2. Apply Dynamic Slice Filters (Epsilon Snaps)
${pyFilters.trim() ? pyFilters.trim() : '# No active dimension filters applied'}

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
    "font.serif": ["Computer Modern Roman", "Times New Roman"],
    "font.size": 11
})

fig, ax = plt.subplots(figsize=(7.5, 5.8), dpi=300)

# 5. Render Heatmap with pcolormesh
shading_mode = 'gouraud' if ${smoothHeatmap ? 'True' : 'False'} else 'auto'
im = ax.pcolormesh(
    X, Y, Z,
    cmap="${pyCmap}",
    shading=shading_mode,
    vmin=${colorLimits.finalZMin.toFixed(6)},
    vmax=${colorLimits.finalZMax.toFixed(6)}
)

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
plt.show()
`;
}
