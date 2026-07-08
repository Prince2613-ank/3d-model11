// Derives a monthly production shape for one building from data the backend
// already computed — the building's own real dailyKwh for the selected date,
// scaled by the ratio of each month's real NASA POWER irradiance to the
// irradiance used for that day. This reuses the estimator's output instead
// of re-implementing its efficiency/shading constants on the frontend.

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface MonthlyPoint {
  month: string;
  dailyKwh: number;
  irradiance: number;
}

export function deriveMonthlyProduction(
  dailyKwh: number,
  selectedDayIrradiance: number,
  monthlyIrradianceKwhM2Day: number[],
): MonthlyPoint[] {
  if (monthlyIrradianceKwhM2Day.length !== 12 || selectedDayIrradiance <= 0) return [];

  return monthlyIrradianceKwhM2Day.map((irradiance, i) => ({
    month: MONTH_LABELS[i],
    dailyKwh: Math.round(dailyKwh * (irradiance / selectedDayIrradiance) * 10) / 10,
    irradiance,
  }));
}
