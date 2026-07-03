// Entry point — call initAmenities() once from main.ts.
// Sets up the panel UI and wires the Cesium click handler for amenity entities.

import * as Cesium from "cesium";
import { viewer } from "../viewer";
import { initPanel, onAmenityEntityClick } from "./panel";

export function initAmenities(): void {
  initPanel();

  // Independent ScreenSpaceEventHandler so we don't overwrite existing handlers.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(
    (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked) || !picked?.id) return;

      const entity = picked.id as Cesium.Entity;
      const amenityId = entity.properties
        ?.amenity_id
        ?.getValue(Cesium.JulianDate.now()) as string | undefined;

      if (!amenityId) return; // not an amenity entity — let other handlers proceed
      onAmenityEntityClick(amenityId);
    },
    Cesium.ScreenSpaceEventType.LEFT_CLICK,
  );
}
