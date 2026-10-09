import React, { useState, useMemo, useEffect, useRef } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min";
import {
  Upload,
  Settings,
  Sliders,
  Download,
  Database,
  Check,
  AlertTriangle,
  RotateCcw,
  Info,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { generatePythonCode } from "./utils/generatePythonCode";

// Declare MathJax global types for TypeScript
declare global {
  interface Window {
    MathJax?: {
      Hub?: {
        Queue: (args: any[]) => void;
      };
    };
  }
}

interface ParsedData {
  headers: string[];
  rows: Record<string, any>[];
  filename?: string;
  isDemo?: boolean;
}

// MathJax Live Typesetting Component for UI Inputs
const MathJaxPreview: React.FC<{ text: string; className?: string }> = ({
  text,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = text;
      if (window.MathJax && window.MathJax.Hub) {
        try {
          window.MathJax.Hub.Queue([
            "Typeset",
            window.MathJax.Hub,
            containerRef.current,
          ]);
        } catch (err: any) {
          console.error("MathJax typesetting failed", err);
        }
      }
    }
  }, [text]);

  return <div ref={containerRef} className={className} />;
};

// Parameter classification helper to detect if a header is an independent parameter or dependent metric
const isIndependentParameter = (header: string, uniqueVals: any[]) => {
  const nameLower = header.toLowerCase();
  if (
    nameLower.includes("phase") ||
    nameLower.includes("state") ||
    nameLower.includes("class") ||
    nameLower.includes("status") ||
    nameLower.includes("label")
  ) {
    return false;
  }
  const allNumeric = uniqueVals.every(
    (v) => typeof v === "number" && !isNaN(v),
  );
  if (!allNumeric) {
    return false;
  }
  if (uniqueVals.length > 15) {
    return false;
  }
  return true;
};

const formatLabel = (name: string) => {
  if (!name) return "";
  if (name.includes("$")) return name;
  return name
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export default function App() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [xAxis, setXAxis] = useState<string>("driving_freq");
  const [yAxis, setYAxis] = useState<string>("coupling_const");
  const [zAxis, setZAxis] = useState<string>("lyapunov_val");
  const [colormap, setColormap] = useState<string>("Viridis");
  const [smoothHeatmap, setSmoothHeatmap] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // LaTeX inputs
  const [titleInput, setTitleInput] = useState<string>("");
  const [xTitleInput, setXTitleInput] = useState<string>("");
  const [yTitleInput, setYTitleInput] = useState<string>("");
  const [zTitleInput, setZTitleInput] = useState<string>("");

  const [isTitleEdited, setIsTitleEdited] = useState<boolean>(false);
  const [isXTitleEdited, setIsXTitleEdited] = useState<boolean>(false);
  const [isYTitleEdited, setIsYTitleEdited] = useState<boolean>(false);
  const [isZTitleEdited, setIsZTitleEdited] = useState<boolean>(false);

  const [copiedPython, setCopiedPython] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>(
    "simulation_sweep_data.csv",
  );

  // Color scaling settings
  const [autoScaleColor, setAutoScaleColor] = useState<boolean>(false);
  const [manualZMin, setManualZMin] = useState<number>(-0.9);
  const [manualZMax, setManualZMax] = useState<number>(0.9);

  // Export properties
  const [exportWidth, setExportWidth] = useState<number>(800);
  const [exportHeight, setExportHeight] = useState<number>(600);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Filters
  const [filters, setFilters] = useState<Record<string, number>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>(
    {},
  );

  // Plotly Div element reference
  const graphDivRef = useRef<any>(null);

  // Contour Overlay States
  const [showContours, setShowContours] = useState<boolean>(false);
  const [contourLevels, setContourLevels] = useState<number>(8);
  const [showContourLabels, setShowContourLabels] = useState<boolean>(true);

  // CSV Ingestion Handler
  const processCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data as Record<string, any>[];

        if (headers.length < 3) {
          alert(
            "CSV requires at least 3 columns for X, Y, and color (Z) mapping.",
          );
          return;
        }

        const isDemo =
          file.name.includes("synthetic_physics") ||
          headers.includes("driving_freq");

        setData({
          headers,
          rows,
          filename: file.name,
          isDemo,
        });

        setUploadedFileName(file.name);

        const xDefault =
          headers.find(
            (h) => h.toLowerCase().includes("freq") || h.toLowerCase() === "x",
          ) || headers[0];
        const yDefault =
          headers.find(
            (h) =>
              h.toLowerCase().includes("coupling") || h.toLowerCase() === "y",
          ) || headers[1];
        const zDefault =
          headers.find(
            (h) =>
              h.toLowerCase().includes("lyapunov") || h.toLowerCase() === "z",
          ) || headers[headers.length - 1];

        setXAxis(xDefault);
        setYAxis(yDefault);
        setZAxis(zDefault);

        if (isDemo) {
          const initialFilters = {
            damping_gamma: 1,
            noise_level: 0,
            phase_state: 0,
          };
          const initialActive = {
            damping_gamma: true,
            noise_level: true,
            phase_state: false,
          };
          setFilters(initialFilters);
          setActiveFilters(initialActive);
          setAutoScaleColor(false);
          setManualZMin(-0.9);
          setManualZMax(0.9);
        } else {
          setFilters({});
          setActiveFilters({});
          setAutoScaleColor(true);
        }
      },
      error: (err) => {
        alert("Error parsing CSV: " + err.message);
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processCSV(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCSV(file);
    }
  };

  const extraDimensions = useMemo(() => {
    if (!data) return [];
    return data.headers.filter(
      (h) => h !== xAxis && h !== yAxis && h !== zAxis,
    );
  }, [data, xAxis, yAxis, zAxis]);

  const dimensionUniqueValues = useMemo(() => {
    if (!data) return {};
    const valuesMap: Record<string, any[]> = {};
    data.headers.forEach((header) => {
      const vals = data.rows
        .map((r) => r[header])
        .filter((v) => v !== undefined && v !== null);
      const unique = Array.from(new Set(vals));

      const isNumeric = unique.every(
        (v) => typeof v === "number" || !isNaN(Number(v)),
      );
      if (isNumeric) {
        valuesMap[header] = unique.map(Number).sort((a, b) => a - b);
      } else {
        valuesMap[header] = unique
          .map(String)
          .sort((a, b) => a.localeCompare(b));
      }
    });
    return valuesMap;
  }, [data]);

  useEffect(() => {
    if (!xAxis || !yAxis || !zAxis) return;
    setIsTitleEdited(false);
    setIsXTitleEdited(false);
    setIsYTitleEdited(false);
    setIsZTitleEdited(false);
  }, [xAxis, yAxis, zAxis, data]);

  useEffect(() => {
    if (!data) return;
    const initialFilters: Record<string, number> = {};
    const initialActive: Record<string, boolean> = {};

    extraDimensions.forEach((dim) => {
      const uniqueVals = dimensionUniqueValues[dim] || [];
      let defaultIdx = 0;
      if (data.isDemo) {
        if (dim === "damping_gamma") {
          const idx = uniqueVals.indexOf(0.1);
          defaultIdx = idx !== -1 ? idx : 1;
        } else if (dim === "noise_level") {
          const idx = uniqueVals.indexOf(0.0);
          defaultIdx = idx !== -1 ? idx : 0;
        } else {
          defaultIdx = Math.floor(uniqueVals.length / 2);
        }
      } else {
        defaultIdx = Math.floor(uniqueVals.length / 2);
      }
      initialFilters[dim] = Math.max(0, defaultIdx);
      initialActive[dim] = isIndependentParameter(dim, uniqueVals);
    });

    setFilters(initialFilters);
    setActiveFilters(initialActive);
  }, [data, extraDimensions, dimensionUniqueValues]);

  const isValidMapping = useMemo(() => {
    if (!xAxis || !yAxis || !zAxis) return false;
    return xAxis !== yAxis && xAxis !== zAxis && yAxis !== zAxis;
  }, [xAxis, yAxis, zAxis]);

  useEffect(() => {
    if (!xAxis || !yAxis || !zAxis || !data) return;

    if (data.isDemo) {
      const gammaIdx = filters["damping_gamma"] ?? 1;
      const gammaVals = dimensionUniqueValues["damping_gamma"] || [0.1];
      const gammaVal = gammaVals[gammaIdx] ?? 0.1;

      const sigmaIdx = filters["noise_level"] ?? 0;
      const sigmaVals = dimensionUniqueValues["noise_level"] || [0.0];
      const sigmaVal = sigmaVals[sigmaIdx] ?? 0.0;

      const gammaStr = activeFilters["damping_gamma"]
        ? `\\gamma = ${gammaVal}`
        : "\\text{All } \\gamma";
      const sigmaStr = activeFilters["noise_level"]
        ? `\\sigma = ${sigmaVal}`
        : "\\text{All } \\sigma";

      if (!isTitleEdited) {
        setTitleInput(`$\\text{Slice: } ${gammaStr}, \\;${sigmaStr}$`);
      }
      if (!isXTitleEdited) {
        setXTitleInput("$\\text{Driving Frequency } \\omega/\\omega_0$");
      }
      if (!isYTitleEdited) {
        setYTitleInput("$\\text{Coupling Constant } g/\\hbar$");
      }
      if (!isZTitleEdited) {
        setZTitleInput("$\\text{Max Lyapunov Exponent } \\lambda_{\\max}$");
      }
    } else {
      const activeSlices = extraDimensions
        .filter((dim) => activeFilters[dim])
        .map((dim) => {
          const idx = filters[dim] ?? 0;
          const val = (dimensionUniqueValues[dim] || [])[idx];
          return `\\text{${formatLabel(dim)}} = ${val}`;
        });

      if (!isTitleEdited) {
        if (activeSlices.length > 0) {
          setTitleInput(`$\\text{Slice: } ${activeSlices.join(", \\;")}$`);
        } else {
          setTitleInput(
            `$\\text{${formatLabel(zAxis)}} \\text{ vs } (\\text{${formatLabel(xAxis)}}, \\text{${formatLabel(yAxis)}})$`,
          );
        }
      }
      if (!isXTitleEdited) {
        setXTitleInput(`$\\text{${formatLabel(xAxis)}}$`);
      }
      if (!isYTitleEdited) {
        setYTitleInput(`$\\text{${formatLabel(yAxis)}}$`);
      }
      if (!isZTitleEdited) {
        setZTitleInput(`$\\text{${formatLabel(zAxis)}}$`);
      }
    }
  }, [
    xAxis,
    yAxis,
    zAxis,
    filters,
    activeFilters,
    dimensionUniqueValues,
    data,
    extraDimensions,
    isTitleEdited,
    isXTitleEdited,
    isYTitleEdited,
    isZTitleEdited,
  ]);

  const filteredRows = useMemo(() => {
    if (!data || !isValidMapping) return [];

    return data.rows.filter((row) => {
      return extraDimensions.every((dim) => {
        const isActive = activeFilters[dim];
        if (!isActive) return true;

        const selectedIdx = filters[dim] ?? 0;
        const uniqueVals = dimensionUniqueValues[dim] || [];
        const targetVal = uniqueVals[selectedIdx];

        if (targetVal === undefined) return true;

        const rowVal = row[dim];

        if (typeof targetVal === "number" && typeof rowVal === "number") {
          return Math.abs(rowVal - targetVal) < 1e-6;
        }
        return String(rowVal) === String(targetVal);
      });
    });
  }, [
    data,
    isValidMapping,
    extraDimensions,
    filters,
    activeFilters,
    dimensionUniqueValues,
  ]);

  const heatmapGrid = useMemo(() => {
    if (!data || !isValidMapping) return null;

    const xCoords = dimensionUniqueValues[xAxis] || [];
    const yCoords = dimensionUniqueValues[yAxis] || [];

    if (xCoords.length === 0 || yCoords.length === 0) return null;

    const grid: any[][] = Array.from({ length: yCoords.length }, () =>
      Array.from({ length: xCoords.length }, () => null),
    );

    filteredRows.forEach((row) => {
      const rowX = row[xAxis];
      const rowY = row[yAxis];
      const rowZ = row[zAxis];

      if (rowX === undefined || rowY === undefined || rowZ === undefined)
        return;

      const xIdx = xCoords.findIndex((val) => {
        if (typeof val === "number" && typeof rowX === "number") {
          return Math.abs(val - rowX) < 1e-6;
        }
        return String(val) === String(rowX);
      });

      const yIdx = yCoords.findIndex((val) => {
        if (typeof val === "number" && typeof rowY === "number") {
          return Math.abs(val - rowY) < 1e-6;
        }
        return String(val) === String(rowY);
      });

      if (xIdx !== -1 && yIdx !== -1) {
        if (grid[yIdx][xIdx] === null) {
          grid[yIdx][xIdx] = [];
        }
        grid[yIdx][xIdx].push(Number(rowZ));
      }
    });

    const finalZ = grid.map((yRow) =>
      yRow.map((cell) => {
        if (cell === null) return null;
        const validNumbers = cell.filter((v: any) => !isNaN(v));
        if (validNumbers.length === 0) return null;
        return (
          validNumbers.reduce((a: number, b: number) => a + b, 0) /
          validNumbers.length
        );
      }),
    );

    return {
      x: xCoords,
      y: yCoords,
      z: finalZ,
    };
  }, [
    data,
    isValidMapping,
    xAxis,
    yAxis,
    zAxis,
    filteredRows,
    dimensionUniqueValues,
  ]);

  const colorLimits = useMemo(() => {
    if (!heatmapGrid || !heatmapGrid.z)
      return { finalZMin: -0.9, finalZMax: 0.9 };

    const zVals = heatmapGrid.z
      .flat()
      .filter((v): v is number => v !== null && !isNaN(v));
    if (zVals.length === 0) return { finalZMin: -0.9, finalZMax: 0.9 };

    const minVal = Math.min(...zVals);
    const maxVal = Math.max(...zVals);

    const activeZMin = autoScaleColor ? minVal : manualZMin;
    const activeZMax = autoScaleColor ? maxVal : manualZMax;
    const finalZMax = activeZMin === activeZMax ? activeZMax + 0.1 : activeZMax;

    return {
      finalZMin: activeZMin,
      finalZMax: finalZMax,
    };
  }, [heatmapGrid, autoScaleColor, manualZMin, manualZMax]);

  const triggerMathJaxQueue = (targetDiv?: HTMLElement) => {
    if (window.MathJax && window.MathJax.Hub) {
      try {
        window.MathJax.Hub.Queue([
          "Typeset",
          window.MathJax.Hub,
          targetDiv || graphDivRef.current,
        ]);
      } catch (err: any) {
        console.error("MathJax update queue failed", err);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      triggerMathJaxQueue();
    }, 150);
    return () => clearTimeout(timer);
  }, [
    heatmapGrid,
    titleInput,
    xTitleInput,
    yTitleInput,
    zTitleInput,
    colormap,
    smoothHeatmap,
    colorLimits,
  ]);

  const handleExportSVG = () => {
    if (!graphDivRef.current) return;
    setIsExporting(true);

    setTimeout(() => {
      Plotly.downloadImage(graphDivRef.current, {
        format: "svg",
        width: exportWidth,
        height: exportHeight,
        filename: data?.filename
          ? `${data.filename.split(".")[0]}_heatmap`
          : "ndheat_publication_plot",
      })
        .then(() => setIsExporting(false))
        .catch((err: any) => {
          console.error("Export failed", err);
          setIsExporting(false);
        });
    }, 300);
  };

  const handleCopyPythonCode = () => {
    if (!data) return;
    const pythonCode = generatePythonCode({
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
      filename: uploadedFileName,
      showContours,
      contourLevels,
      showContourLabels,
    });

    navigator.clipboard
      .writeText(pythonCode)
      .then(() => {
        setCopiedPython(true);
        setTimeout(() => setCopiedPython(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy python script", err);
      });
  };

  const handleResetData = () => {
    setData(null);
    setXAxis("");
    setYAxis("");
    setZAxis("");
    setFilters({});
    setActiveFilters({});
    setUploadedFileName("simulation_sweep_data.csv");
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/70 border-b border-slate-900/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-xl text-white tracking-wider">
            H
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-100 via-slate-100 to-cyan-200 bg-clip-text text-transparent">
              NDHeat
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              N-Dimensional Physics Sweep Visualizer
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {data && isValidMapping && (
            <div className="flex items-center space-x-2 bg-slate-900/50 border border-slate-800/80 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <span className="text-slate-400">Bilinear Smoothing</span>
              <button
                onClick={() => setSmoothHeatmap(!smoothHeatmap)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  smoothHeatmap ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-100 shadow-lg ring-0 transition duration-200 ease-in-out ${
                    smoothHeatmap ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {data ? (
            <>
              <div className="hidden md:flex items-center space-x-2 bg-slate-900/60 border border-slate-800/80 px-3 py-1 rounded-lg text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-slate-400 max-w-[150px] truncate">
                  {data.filename}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-semibold">
                  {data.rows.length.toLocaleString()} rows
                </span>
              </div>
              <button
                onClick={handleResetData}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 transition duration-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </>
          ) : (
            <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full font-medium">
              100% Client-Side Physics Studio
            </span>
          )}
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 max-w-[1600px] mx-auto w-full">
        {/* LEFT SIDEBAR */}
        <section className="lg:col-span-4 space-y-6 flex flex-col">
          {/* Card 1: Data Ingestor */}
          <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center space-x-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>File Ingestion</span>
            </h2>

            {!data ? (
              <div className="space-y-4">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-500/10 shadow-inner"
                      : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60"
                  }`}
                >
                  <input
                    type="file"
                    id="csv-file-upload"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="csv-file-upload"
                    className="cursor-pointer flex flex-col items-center justify-center"
                  >
                    <Upload className="w-10 h-10 text-slate-500 mb-3 animate-bounce" />
                    <span className="text-sm font-semibold text-slate-300">
                      Drag & drop CSV file
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      or click to browse local directory
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 text-emerald-400 text-sm">
                <Check className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Dataset Active</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    Loaded{" "}
                    {data.isDemo
                      ? "Synthetic Physics Sweep (50x50)"
                      : "Custom CSV"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Mapping Configurations */}
          {data && (
            <>
              <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4">
                <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <span>Axis Mapping Panel</span>
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      X Axis (Horizontal Grid)
                    </label>
                    <select
                      className="w-full bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition font-mono"
                      value={xAxis}
                      onChange={(e) => setXAxis(e.target.value)}
                    >
                      {data.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Y Axis (Vertical Grid)
                    </label>
                    <select
                      className="w-full bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition font-mono"
                      value={yAxis}
                      onChange={(e) => setYAxis(e.target.value)}
                    >
                      {data.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Z Axis (Heatmap Color Intensity)
                    </label>
                    <select
                      className="w-full bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition font-mono"
                      value={zAxis}
                      onChange={(e) => setZAxis(e.target.value)}
                    >
                      {data.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {!isValidMapping && (
                  <div className="flex items-start space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs mt-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Mapping Conflict:</strong> Ensure X, Y, and Z
                      mapping columns are unique to compute the grid correctly.
                    </span>
                  </div>
                )}
              </div>

              {/* CONTOUR OVERLAY SETTINGS */}
              <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="toggle-contours"
                    className="text-sm font-semibold text-slate-200 cursor-pointer"
                  >
                    Overlay Contours
                  </label>
                  <input
                    id="toggle-contours"
                    type="checkbox"
                    checked={showContours}
                    onChange={(e) => setShowContours(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700 cursor-pointer focus:ring-blue-500"
                  />
                </div>

                {showContours && (
                  <div className="space-y-3 pt-3 border-t border-slate-800/80">
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Contour Levels</span>
                        <span className="font-mono text-slate-200">
                          {contourLevels}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="20"
                        value={contourLevels}
                        onChange={(e) =>
                          setContourLevels(Number(e.target.value))
                        }
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="toggle-labels"
                        className="text-xs text-slate-400 cursor-pointer"
                      >
                        Inline Value Labels
                      </label>
                      <input
                        id="toggle-labels"
                        type="checkbox"
                        checked={showContourLabels}
                        onChange={(e) => setShowContourLabels(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-500 bg-slate-800 border-slate-700 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Slicing Panel */}
              <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4 flex-1">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Dynamic Slicing</span>
                  </h2>
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                    Bypass Mode
                  </span>
                </div>

                {extraDimensions.length === 0 ? (
                  <div className="h-28 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-xl text-slate-500">
                    <Info className="w-5 h-5 mb-1.5 text-slate-600" />
                    <p className="text-xs">
                      No additional dimensions found. Plotting full 2D space.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {extraDimensions.map((dim) => {
                      const uniqueVals = dimensionUniqueValues[dim] || [];
                      const selectedIdx = filters[dim] ?? 0;
                      const currentVal = uniqueVals[selectedIdx];
                      const isFilterActive = activeFilters[dim] ?? false;

                      return (
                        <div
                          key={dim}
                          className="space-y-2 bg-slate-950/30 border border-slate-900/50 p-3 rounded-xl transition-all duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() =>
                                  setActiveFilters((prev) => ({
                                    ...prev,
                                    [dim]: !isFilterActive,
                                  }))
                                }
                                className={`flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-md transition ${
                                  isFilterActive
                                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/30"
                                    : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
                                }`}
                              >
                                {isFilterActive ? (
                                  <Eye className="w-3 h-3 text-indigo-400" />
                                ) : (
                                  <EyeOff className="w-3 h-3 text-slate-500" />
                                )}
                                <span className="font-mono">{dim}</span>
                              </button>
                            </div>
                            <span className="text-xs font-mono text-slate-300 font-semibold bg-slate-900 px-2 py-0.5 rounded border border-slate-800/80">
                              {isFilterActive ? currentVal : "All / No Filter"}
                            </span>
                          </div>

                          {isFilterActive ? (
                            <div className="space-y-1 pt-1">
                              {uniqueVals.every(
                                (v) => typeof v === "number",
                              ) ? (
                                <div className="flex items-center space-x-3">
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {uniqueVals[0]}
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={Math.max(0, uniqueVals.length - 1)}
                                    step={1}
                                    value={selectedIdx}
                                    onChange={(e) => {
                                      const idx = parseInt(e.target.value, 10);
                                      setFilters((prev) => ({
                                        ...prev,
                                        [dim]: idx,
                                      }));
                                    }}
                                    className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer appearance-none focus:outline-none"
                                  />
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {uniqueVals[uniqueVals.length - 1]}
                                  </span>
                                </div>
                              ) : (
                                <select
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs font-mono text-slate-300"
                                  value={selectedIdx}
                                  onChange={(e) => {
                                    const idx = parseInt(e.target.value, 10);
                                    setFilters((prev) => ({
                                      ...prev,
                                      [dim]: idx,
                                    }));
                                  }}
                                >
                                  {uniqueVals.map((v, i) => (
                                    <option key={v} value={i}>
                                      {v}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                                <span>Steps: {uniqueVals.length}</span>
                                <span>Tolerance: $10^{`{-6}`} $ epsilon</span>
                              </div>
                            </div>
                          ) : (
                            <div className="py-2.5 text-center text-[10px] text-slate-500 font-mono bg-slate-950/40 rounded-lg border border-slate-900 border-dashed">
                              Bypassed: Entire range is dynamically integrated
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="bg-slate-900/80 border border-slate-800/80 p-3 rounded-xl text-center flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400">
                        Sliced Data Subset:
                      </span>
                      <span className="font-mono text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
                        {filteredRows.length.toLocaleString()} of{" "}
                        {data.rows.length.toLocaleString()} rows
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* RIGHT VISUALIZATION SECTION */}
        <section className="lg:col-span-8 flex flex-col space-y-6">
          <div className="bg-slate-900/35 backdrop-blur-md border border-slate-900 shadow-2xl rounded-3xl p-6 flex flex-col relative min-h-[550px] justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-4 mb-4">
              <div>
                <h3 className="font-bold text-slate-200 text-base">
                  Visualization Studio
                </h3>
                <p className="text-xs text-slate-500">
                  Interactive live scientific plotting grid
                </p>
              </div>

              {data && isValidMapping && (
                <div className="flex items-center space-x-3 self-end sm:self-auto">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                    <span>Colormap:</span>
                    <select
                      className="bg-slate-950 border border-slate-800 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                      value={colormap}
                      onChange={(e) => setColormap(e.target.value)}
                    >
                      <option value="Viridis">Viridis</option>
                      <option value="Plasma">Plasma</option>
                      <option value="Inferno">Inferno</option>
                      <option value="Magma">Magma</option>
                      <option value="Cividis">Cividis</option>
                      <option value="Turbo">Turbo</option>
                      <option value="RdBu">RdBu (Diverging)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Single Unified Plotly Canvas */}
            <div className="flex-1 flex items-center justify-center p-2 relative">
              {!data ? (
                <div className="text-center p-8 flex flex-col items-center max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
                    <Database className="w-8 h-8 animate-pulse" />
                  </div>
                  <h4 className="font-semibold text-slate-300 text-sm">
                    Visualizer Ready
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Upload a physics simulation CSV file or drop your parameter
                    sweep data to view the interactive live heatmap.
                  </p>
                </div>
              ) : !isValidMapping ? (
                <div className="text-center p-8 flex flex-col items-center max-w-sm text-slate-400">
                  <AlertTriangle className="w-10 h-10 text-rose-500 mb-3" />
                  <h4 className="font-semibold text-rose-400 text-sm">
                    Mapping Conflict
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Please map unique CSV columns to X-Axis, Y-Axis, and Z-Axis
                    in the Mapping Panel.
                  </p>
                </div>
              ) : heatmapGrid ? (
                <div className="w-full h-full flex items-center justify-center overflow-hidden bg-white p-4 rounded-2xl border border-slate-200/80 shadow-inner">
                  <Plot
                    data={[
                      // Trace 0: Base Heatmap
                      {
                        x: heatmapGrid.x,
                        y: heatmapGrid.y,
                        z: heatmapGrid.z,
                        type: "heatmap",
                        colorscale: colormap,
                        zsmooth: smoothHeatmap ? "best" : false,
                        xgap: 0,
                        ygap: 0,
                        zmin: colorLimits.finalZMin,
                        zmax: colorLimits.finalZMax,
                        colorbar: {
                          tickfont: {
                            color: "#000000",
                            family:
                              "'Computer Modern', 'Times New Roman', serif",
                            size: 11,
                          },
                          xpad: 15,
                        },
                        hoverongaps: false,
                      },
                      // Trace 1: Dynamic Contour Lines Overlay
                      ...(showContours
                        ? [
                            {
                              type: "contour",
                              x: heatmapGrid.x,
                              y: heatmapGrid.y,
                              z: heatmapGrid.z,
                              showscale: false,
                              autocontour: false,
                              contours: {
                                coloring: "none",
                                start: colorLimits.finalZMin,
                                end: colorLimits.finalZMax,
                                size:
                                  (colorLimits.finalZMax -
                                    colorLimits.finalZMin) /
                                  contourLevels,
                                showlabels: showContourLabels,
                                labelfont: {
                                  family: "serif",
                                  size: 9,
                                  color: "#000000",
                                },
                              },
                              line: {
                                color: "rgba(255, 255, 255, 0.65)",
                                width: 1.2,
                                smoothing: 0.8,
                              },
                              hoverinfo: "none",
                            },
                          ]
                        : []),
                    ]}
                    layout={{
                      title: {
                        text: titleInput,
                        font: {
                          color: "#000000",
                          family: "'Computer Modern', 'Times New Roman', serif",
                          size: 15,
                        },
                        y: 0.96,
                      },
                      xaxis: {
                        title: {
                          text: xTitleInput,
                          font: {
                            color: "#000000",
                            family:
                              "'Computer Modern', 'Times New Roman', serif",
                            size: 13,
                          },
                          standoff: 20,
                        },
                        showline: true,
                        mirror: "allticks",
                        linecolor: "#000000",
                        linewidth: 1.5,
                        ticks: "outside",
                        ticklen: 5,
                        tickcolor: "#000000",
                        showgrid: false,
                        zeroline: false,
                        tickfont: {
                          color: "#000000",
                          family: "'Computer Modern', 'Times New Roman', serif",
                          size: 11,
                        },
                      },
                      yaxis: {
                        title: {
                          text: yTitleInput,
                          font: {
                            color: "#000000",
                            family:
                              "'Computer Modern', 'Times New Roman', serif",
                            size: 13,
                          },
                          standoff: 20,
                        },
                        showline: true,
                        mirror: "allticks",
                        linecolor: "#000000",
                        linewidth: 1.5,
                        ticks: "outside",
                        ticklen: 5,
                        tickcolor: "#000000",
                        showgrid: false,
                        zeroline: false,
                        tickfont: {
                          color: "#000000",
                          family: "'Computer Modern', 'Times New Roman', serif",
                          size: 11,
                        },
                      },
                      annotations: [
                        {
                          xref: "paper",
                          yref: "paper",
                          x: 1.15,
                          y: 0.5,
                          text: zTitleInput,
                          textangle: -90,
                          showarrow: false,
                          font: {
                            family:
                              "'Computer Modern', 'Times New Roman', serif",
                            size: 13,
                            color: "#000000",
                          },
                        },
                      ],
                      paper_bgcolor: "#ffffff",
                      plot_bgcolor: "#ffffff",
                      font: {
                        color: "#000000",
                        family: "'Computer Modern', 'Times New Roman', serif",
                      },
                      margin: { l: 80, r: 120, t: 60, b: 70 },
                      autosize: true,
                    }}
                    useResizeHandler={true}
                    className="w-full min-h-[480px] h-full"
                    onInitialized={(_, graphDiv) => {
                      graphDivRef.current = graphDiv;
                      triggerMathJaxQueue(graphDiv);
                    }}
                    onUpdate={(_, graphDiv) => {
                      graphDivRef.current = graphDiv;
                      triggerMathJaxQueue(graphDiv);
                    }}
                  />
                </div>
              ) : (
                <div className="text-slate-400">Loading Grid Matrix...</div>
              )}
            </div>
          </div>

          {/* LaTeX Annotations & Colorbar Range overrides */}
          {data && isValidMapping && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* LaTeX Labels Customizer */}
              <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4 md:col-span-8">
                <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
                  LaTeX Annotations Editor
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold uppercase">
                      Plot Title
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={titleInput}
                      onChange={(e) => {
                        setTitleInput(e.target.value);
                        setIsTitleEdited(true);
                      }}
                    />
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Render:
                      </span>
                      <MathJaxPreview
                        text={titleInput}
                        className="text-[11px] text-slate-400 italic"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold uppercase">
                      Colorbar (Z)
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={zTitleInput}
                      onChange={(e) => {
                        setZTitleInput(e.target.value);
                        setIsZTitleEdited(true);
                      }}
                    />
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Render:
                      </span>
                      <MathJaxPreview
                        text={zTitleInput}
                        className="text-[11px] text-slate-400 italic"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold uppercase">
                      X-Axis Label
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={xTitleInput}
                      onChange={(e) => {
                        setXTitleInput(e.target.value);
                        setIsXTitleEdited(true);
                      }}
                    />
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Render:
                      </span>
                      <MathJaxPreview
                        text={xTitleInput}
                        className="text-[11px] text-slate-400 italic"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold uppercase">
                      Y-Axis Label
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={yTitleInput}
                      onChange={(e) => {
                        setYTitleInput(e.target.value);
                        setIsYTitleEdited(true);
                      }}
                    />
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Render:
                      </span>
                      <MathJaxPreview
                        text={yTitleInput}
                        className="text-[11px] text-slate-400 italic"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Color Scaling Override Panel */}
              <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 space-y-4 md:col-span-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
                    Colorbar Scaling Range
                  </h3>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="auto-scale-checkbox"
                      checked={autoScaleColor}
                      onChange={(e) => setAutoScaleColor(e.target.checked)}
                      className="accent-indigo-500 h-4 w-4 rounded border-slate-800 bg-slate-950 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor="auto-scale-checkbox"
                      className="text-xs font-semibold text-slate-400 cursor-pointer"
                    >
                      Auto-scale range (pcolormesh style)
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold uppercase mb-1">
                        Z-Min Range
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        disabled={autoScaleColor}
                        className="w-full bg-slate-950 disabled:bg-slate-900/40 disabled:text-slate-600 border border-slate-800 hover:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        value={manualZMin}
                        onChange={(e) =>
                          setManualZMin(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold uppercase mb-1">
                        Z-Max Range
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        disabled={autoScaleColor}
                        className="w-full bg-slate-950 disabled:bg-slate-900/40 disabled:text-slate-600 border border-slate-800 hover:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        value={manualZMax}
                        onChange={(e) =>
                          setManualZMax(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800/80 pt-3">
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>Dynamic limits:</span>
                    <span className="font-mono">
                      {heatmapGrid
                        ? `[${Math.min(...heatmapGrid.z.flat().filter((x): x is number => x !== null)).toFixed(2)}, ${Math.max(...heatmapGrid.z.flat().filter((x): x is number => x !== null)).toFixed(2)}]`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SVG Export & Python Copy Buttons */}
          {data && isValidMapping && (
            <div className="bg-slate-900/55 backdrop-blur-md border border-slate-900 shadow-2xl rounded-2xl p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-8">
                <h3 className="text-sm font-bold text-slate-200">
                  SVG Publication Canvas Layout
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Export vector designs directly at publication-ready specs. The
                  margins and standoff spacing are configured to prevent
                  clipping of axis titles and colorbars.
                </p>
              </div>

              <div className="md:col-span-4 flex flex-col space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-500 font-bold uppercase mb-0.5">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono"
                      value={exportWidth}
                      onChange={(e) =>
                        setExportWidth(parseInt(e.target.value, 10) || 800)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 font-bold uppercase mb-0.5">
                      Height (px)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono"
                      value={exportHeight}
                      onChange={(e) =>
                        setExportHeight(parseInt(e.target.value, 10) || 600)
                      }
                    />
                  </div>
                </div>

                <button
                  onClick={handleExportSVG}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white border border-indigo-500/30 rounded-xl py-2.5 text-xs font-bold shadow-lg transition duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Download
                    className={`w-3.5 h-3.5 ${isExporting ? "animate-spin" : ""}`}
                  />
                  <span>
                    {isExporting
                      ? "Generating Vector SVG..."
                      : "Export Publication SVG"}
                  </span>
                </button>

                <button
                  onClick={handleCopyPythonCode}
                  className={`w-full flex items-center justify-center space-x-2 border rounded-xl py-2.5 text-xs font-bold shadow-lg transition duration-200 active:scale-[0.98] ${
                    copiedPython
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  {copiedPython ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedPython
                      ? "Copied Python Script!"
                      : "Copy Python Code"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/60 py-4 px-6 text-center text-xs text-slate-500 mt-auto">
        <p>
          &copy; {new Date().getFullYear()} NDHeat Visualizer Studio. Designed
          for scientific publication layout analysis.
        </p>
      </footer>
    </div>
  );
}
