// Wires Cesium click-picking to the currently rendered solar entities —
// reuses the existing findSolarEntityId helper from solarRenderer.ts.

import { useEffect, useRef } from "react";
import { Cesium, viewer } from "../../viewer";
import { findSolarEntityId } from "../../solar/solarRenderer";
import { SolarAreaEstimate } from "../../solar/solarService";

export function useBuildingPicker(
  estimate: SolarAreaEstimate | null,
  onSelect: (buildingId: string) => void,
): void {
  const estimateRef = useRef(estimate);
  estimateRef.current = estimate;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked) || !picked?.id || !estimateRef.current) return;
      const id = findSolarEntityId(picked.id as Cesium.Entity);
      if (!id) return;
      const exists = estimateRef.current.buildings.some((b) => b.id === id);
      if (exists) onSelectRef.current(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, []);
}
