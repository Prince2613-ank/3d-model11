import { DtBuilding } from "../types/domain";
import { BaseRepository } from "./baseRepository";

export const dtBuildingRepository = new BaseRepository<DtBuilding>("dt_buildings");
