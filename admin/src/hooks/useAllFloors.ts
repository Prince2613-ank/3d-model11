import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DtBuilding, Floor } from "../types/domain";

export interface FloorWithBuilding extends Floor {
  building_name: string;
}

export function useAllFloors() {
  return useQuery({
    queryKey: ["all-floors"],
    queryFn: async (): Promise<FloorWithBuilding[]> => {
      const { buildings } = await api.get<{ buildings: DtBuilding[] }>("/dt-buildings");
      const perBuilding = await Promise.all(
        buildings.map(async (b) => {
          const { floors } = await api.get<{ floors: Floor[] }>(`/floors/building/${b.id}?includeHidden=true`);
          return floors.map((f) => ({ ...f, building_name: b.name }));
        })
      );
      return perBuilding.flat();
    }
  });
}
