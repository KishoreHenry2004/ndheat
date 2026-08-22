import pandas as pd
import numpy as np

print("Generating synthetic physics sweep data...")

# 50 driving frequency steps from 0.5 to 5.0
driving_freqs = np.linspace(0.5, 5.0, 50)
# 50 coupling constant steps from 0.1 to 2.0
coupling_consts = np.linspace(0.1, 2.0, 50)
# Discrete slices for damping_gamma
gammas = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]
# Discrete slices for noise_level
sigmas = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]

rows = []
for omega in driving_freqs:
    for g in coupling_consts:
        for gamma in gammas:
            for sigma in sigmas:
                # Wave pattern modeled as cos(2 * pi * px) * cos(2 * pi * py)
                px = (omega - 2.35) / 1.65
                py = (g - 1.15) / 1.0
                base = np.cos(2 * np.pi * px) * np.cos(2 * np.pi * py)

                damping_factor = 1.0 - 0.25 * gamma
                noise_dampening = 1.0 - 0.3 * sigma

                lyapunov = base * damping_factor * noise_dampening
                lyapunov -= 0.1 * gamma + 0.15 * sigma

                # Clamp to dynamic range [-0.9, 0.9]
                lyapunov = np.clip(lyapunov, -0.9, 0.9)
                lyapunov = round(lyapunov, 6)

                # Discrete output phase status column
                if lyapunov > 0.1:
                    phase_state = "Chaotic"
                elif lyapunov < -0.1:
                    phase_state = "Periodic"
                else:
                    phase_state = "Quasiperiodic"

                rows.append([omega, g, gamma, sigma, phase_state, lyapunov])

df = pd.DataFrame(rows, columns=['driving_freq', 'coupling_const', 'damping_gamma', 'noise_level', 'phase_state', 'lyapunov_val'])
df.to_csv("synthetic_physics_sweep.csv", index=False)
print("Successfully saved synthetic_physics_sweep.csv (90,000 rows). Ready for NDHeat drag-and-drop!")
