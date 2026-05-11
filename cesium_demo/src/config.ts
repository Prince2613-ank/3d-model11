import * as Cesium from "cesium";

export const ALLOWED_DOMAIN = "flodataanalytics.com";
export const POLL_INTERVAL_MS = 8000;
export const CACHE_TTL_MS = 5000;

export type CameraPreset = {
  name: string;
  showInControls?: boolean;
  destination: Cesium.Cartesian3;
  orientation: {
    heading: number;
    pitch: number;
    roll: number;
  };
};

/** Shared room calendar IDs — all bookings are written to and read from these. */
export const ROOM_CALENDARS: Record<string, string> = {
  Dojo: "c_18844fj9dapfqiqkis358k72s6qu6@resource.calendar.google.com",
  Manthan: "c_188f0m5k240tajcghiklsvkpk1osq@resource.calendar.google.com",
  Eureka: "c_188e1suqr4kriiu9l3etqtf5qm6ps@resource.calendar.google.com",
  "Meeting Room": "c_188bvfn5afmqaj3djm0hbjqlfpkac@resource.calendar.google.com",
  "Conference Room": "c_18811n8dsq2v8haakdhev0subolt4@resource.calendar.google.com",
};


export const FLOOR_CAMERAS: Record<number, CameraPreset[]> = {
  3: [
    {
      name: "Stairs Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133730, 28.670906, 9.03),
      orientation: { heading: Cesium.Math.toRadians(293.36), pitch: Cesium.Math.toRadians(-45.22), roll: 0 },
    },
    {
      name: "Room 1 Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133660, 28.670871, 9.86),
      orientation: { heading: Cesium.Math.toRadians(359.90), pitch: Cesium.Math.toRadians(-60.75), roll: 0 },
    },
    {
      name: "Employee area 1",
      destination: Cesium.Cartesian3.fromDegrees(77.133629, 28.670932, 9.13),
      orientation: { heading: Cesium.Math.toRadians(64.73), pitch: Cesium.Math.toRadians(-79.38), roll: 0 },
    },
    {
      name: "Pantry Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133595, 28.670980, 8.00),
      orientation: { heading: Cesium.Math.toRadians(7), pitch: Cesium.Math.toRadians(-61), roll: 0 },
    },
    {
      name: "Corridor Cam 2",
      destination: Cesium.Cartesian3.fromDegrees(77.133654, 28.671010, 11.30),
      orientation: { heading: Cesium.Math.toRadians(179.47), pitch: Cesium.Math.toRadians(-50.29), roll: 0 },
    },
    {
      name: "Corridor Cam 1",
      destination: Cesium.Cartesian3.fromDegrees(77.133730, 28.670906, 8.50),
      orientation: { heading: Cesium.Math.toRadians(2.29), pitch: Cesium.Math.toRadians(-33.10), roll: 0 },
    },
  ],
  4: [
    {
      name: "Employee Area Cam 1",
      destination: Cesium.Cartesian3.fromDegrees(77.133613, 28.670938, 10.81),
      orientation: { heading: Cesium.Math.toRadians(99), pitch: Cesium.Math.toRadians(-30), roll: 0 },
    },
    {
      name: "Library Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133668, 28.670870, 10.81),
      orientation: { heading: Cesium.Math.toRadians(8), pitch: Cesium.Math.toRadians(-32), roll: 0 },
    },

    {
      name: "Employee Area Cam 2",
      showInControls: false,
      destination: Cesium.Cartesian3.fromDegrees(77.133725, 28.670971, 12.01),
      orientation: { heading: Cesium.Math.toRadians(289), pitch: Cesium.Math.toRadians(-30), roll: 0 },
    },
    {
      name: "3rd Floor Employee Area Cam 2",
      destination: Cesium.Cartesian3.fromDegrees(77.133740, 28.670960, 10.81),
      orientation: { heading: Cesium.Math.toRadians(180), pitch: Cesium.Math.toRadians(-36), roll: 0 },
    },
    {
      name: "3rd Floor Pantry Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133700, 28.670897, 11.01),
      orientation: { heading: Cesium.Math.toRadians(348), pitch: Cesium.Math.toRadians(-40), roll: 0 },
    },
    {
      name: "3rd Floor Stair Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133595, 28.670980, 11.21),
      orientation: { heading: Cesium.Math.toRadians(83), pitch: Cesium.Math.toRadians(-54), roll: 0 },
    },
    {
      name: "Meeting Room Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133682, 28.671034, 11.31),
      orientation: { heading: Cesium.Math.toRadians(200), pitch: Cesium.Math.toRadians(-37), roll: 0 },
    },
    {
      name: "Conference Room Cam",
      destination: Cesium.Cartesian3.fromDegrees(77.133595, 28.670980, 11.21),
      orientation: { heading: Cesium.Math.toRadians(83), pitch: Cesium.Math.toRadians(-54), roll: 0 },
    },
  ],
};
