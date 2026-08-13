import { formatRoomInventoryForAssistant } from "./roomInventory";

export type MarkerPoint = { lat: number; lon: number; label?: string };

export type AssistantCallbacks = {
  navigateToRoom: (from: string, to: string) => Promise<void>;
  navigateToPerson: (name: string) => Promise<void>;
  checkAvailability: (room: string) => Promise<string>;
  openBooking: (room: string) => void;
  showFloor: (floor: number) => void;
  showMarkers: (points: MarkerPoint[], floor: number) => void;
  clearMarkers: () => void;
  blinkChairs: (indices: number[], floor: number, color?: "red" | "green") => void;
  bounceSeat: (personName: string, floor: number) => void | Promise<void>;
  triggerOutdoorNav: (origin: string, destination: string) => void;
  startPreviewRoute?: () => void;
  raiseComplaintForRoom: (roomName: string, floor: 3 | 4, issueDescription?: string) => void;
  raiseComplaintForPerson: (personName: string, floor: 3 | 4, issueDescription?: string) => void | Promise<void>;
  showMyComplaints: () => void;
  bookRoom: (roomName: string, date: string, startTime: string, endTime: string) => Promise<string>;
  cancelMyBooking: (roomName: string) => Promise<string>;
  clearRoute: () => void;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  openNotifications: () => void;
  getRoomNames: () => string[];
  getPersonNames: () => string[];
};

type Message = { role: "user" | "assistant"; content: string };

let callbacks: AssistantCallbacks | null = null;
const history: Message[] = [];

// ── Building knowledge ─────────────────────────────────────────────

const BUILDING_KNOWLEDGE = `
COMPANY: FloData Analytics, Delhi. 2020. Founders: Vaibhav Gupta(CEO), Ujjwal Gupta. Data analytics, AI/ML, software, ERP. 70+clients, 26 countries.
2ND FLOOR (show_floor param="2nd"): ${formatRoomInventoryForAssistant("2nd Floor")}. Admin, Pantry(4stools), Washrooms. Vacant:idx1,3,7,8,15,16. Samata-neighbors:Prince,Unknown3.
3RD FLOOR (show_floor param="3rd"): ${formatRoomInventoryForAssistant("3rd Floor")}. Library(4-6), Washrooms, Lounge(foosball). Vacant:idx11,12,26,32,33,34. Neighbors:[Kush↔Uthkarsh↔Nitish][Sparsh↔Nimit↔Albin][Vikas↔Shekhar↔Pratham][Jay↔ChairD↔ChairE][Harsh↔Vikrant↔Raghav][Aniket↔Manav↔Pushkar][Astami↔Carig↔Anshika][Vanshika↔Kapil↔Rohit][Unknown3↔Prince↔Samata][Payel/Payal↔Akshay][Aishwarya]. Payel/Payal neighbors:Akshay and Samata-cluster.
MEET: 1-4→Dojo. 5-6→Eureka. 7-9→Manthan. 10-12→Conference. Presentation→Eureka/Conference. Total:15CCTVs.
`;

// ── Room coordinates for markers ──────────────────────────────────

const ROOM_COORDS: Record<string, { lat: number; lon: number; floor: number }> = {
  "Dojo":            { lat: 28.67092944681110, lon: 77.13366540177487, floor: 3 },
  "Manthan":         { lat: 28.67094925880298, lon: 77.13370522156849, floor: 3 },
  "Eureka":          { lat: 28.67098951671396, lon: 77.13368649275453, floor: 3 },
  "UG's Cabin":      { lat: 28.67100097148032, lon: 77.13367439510367, floor: 3 },
  "VG's Cabin":      { lat: 28.67096311881750, lon: 77.13362981197865, floor: 3 },
  "Director":        { lat: 28.67095426028975, lon: 77.13369628484955, floor: 3 },
  "Admin":           { lat: 28.67089008887495, lon: 77.13366861432342, floor: 3 },
  "Pantry 2nd":      { lat: 28.67098751501402, lon: 77.13361505798458, floor: 3 },
  "Conference Room": { lat: 28.67094988101015, lon: 77.13363876416800, floor: 4 },
  "Meeting Room":    { lat: 28.67101321416699, lon: 77.13366405005728, floor: 4 },
  "Library":         { lat: 28.67090062000000, lon: 77.13365455000000, floor: 4 },
  "Pantry 3rd":      { lat: 28.67095703850098, lon: 77.13371705946003, floor: 4 },
};

const FREE_SPACES: Record<string, { floor: number; lat: number; lon: number; label: string }[]> = {
  "2nd floor": [
    { floor: 3, lat: 28.671000, lon: 77.133615, label: "Near Pantry corridor" },
    { floor: 3, lat: 28.670990, lon: 77.133630, label: "Washroom corridor side" },
    { floor: 3, lat: 28.670900, lon: 77.133700, label: "Near Entrance area" },
  ],
  "3rd floor": [
    { floor: 4, lat: 28.670960, lon: 77.133720, label: "Lounge recreation area" },
    { floor: 4, lat: 28.670910, lon: 77.133660, label: "Library corner" },
    { floor: 4, lat: 28.671010, lon: 77.133660, label: "Side corridor by Meeting Room" },
  ],
};

// Assigned (named employee) chair indices per floor
const ASSIGNED_SEAT_INDICES: Record<string, { floor: number; indices: number[] }> = {
  "2nd floor": { floor: 3, indices: [2, 4, 5, 6, 9, 10, 11, 12, 13, 14, 17, 18] },
  "3rd floor": { floor: 4, indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 28, 29, 30, 31] },
};

// Person desk coordinates from chairNavPoints
const PERSON_DESKS: Record<string, { lat: number; lon: number; floor: number }> = {
  "unknown1":  { floor: 3, lat: 28.670886321205604, lon: 77.13368028251561 },
  "shuvankit": { floor: 3, lat: 28.670895309105752, lon: 77.13367395601170 },
  "unknown2":  { floor: 3, lat: 28.670909041686500, lon: 77.13366524374470 },
  "vidit":     { floor: 3, lat: 28.670916992228854, lon: 77.13365960266368 },
  "diksha":    { floor: 3, lat: 28.670924515237306, lon: 77.13365565763435 },
  "apoorva":   { floor: 3, lat: 28.670932109317192, lon: 77.13365124410326 },
  "kushi":     { floor: 3, lat: 28.670945706181264, lon: 77.13366728509138 },
  "vishal":    { floor: 3, lat: 28.670950656667460, lon: 77.13367497602529 },
  "rohit":     { floor: 3, lat: 28.670955783956735, lon: 77.13368195974688 },
  "vibhu":     { floor: 3, lat: 28.670963961099110, lon: 77.13369499897394 },
  "jiteswar":  { floor: 3, lat: 28.670960148297805, lon: 77.13369821782014 },
  "swati":     { floor: 3, lat: 28.670952717324177, lon: 77.13370345760923 },
  "ankita":    { floor: 3, lat: 28.670984704682880, lon: 77.13368079113602 },
  "himanshi":  { floor: 3, lat: 28.670986122721004, lon: 77.13368327939159 },
  "kush":      { floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  "uthkarsh":  { floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  "nitish":    { floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  "sparsh":    { floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  "nimit":     { floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  "albin":     { floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  "vikas":     { floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  "shekhar":   { floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  "pratham":   { floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  "jay":       { floor: 4, lat: 28.670965520677640, lon: 77.13366146400278 },
  "harsh":     { floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  "vikrant":   { floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  "raghav":    { floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  "aniket":    { floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  "manav":     { floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  "pushkar":   { floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  "astami":    { floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  "carig":     { floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  "anshika":   { floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  "vanshika":  { floor: 4, lat: 28.670992988917380, lon: 77.13366635160304 },
  "kapil":     { floor: 4, lat: 28.670992988917380, lon: 77.13366635160304 },
  "prince":    { floor: 4, lat: 28.671002348834990, lon: 77.13365845073096 },
  "samata":    { floor: 4, lat: 28.671002348834990, lon: 77.13365845073096 },
  "payel":     { floor: 4, lat: 28.671005729825460, lon: 77.13366304941569 },
  "payal":     { floor: 4, lat: 28.671005729825460, lon: 77.13366304941569 },
  "akshay":    { floor: 4, lat: 28.671005729825460, lon: 77.13366304941569 },
  "aishwarya": { floor: 4, lat: 28.671008778430020, lon: 77.13366743178476 },
};

const VACANT_SEAT_INDICES: Record<string, { floor: number; indices: number[]; coords: { lat: number; lon: number }[] }> = {
  "2nd floor": {
    floor: 3,
    indices: [1, 3, 7, 8, 15, 16],
    coords: [
      { lat: 28.670886321205604, lon: 77.13368028251561 },
      { lat: 28.670909041686500, lon: 77.13366524374470 },
      { lat: 28.670934567587334, lon: 77.13364951638200 },
      { lat: 28.670940667293540, lon: 77.13365915214976 },
      { lat: 28.670968583293670, lon: 77.13369141120200 },
      { lat: 28.670980200395720, lon: 77.13368379115549 },
    ],
  },
  "3rd floor": {
    floor: 4,
    indices: [11, 12, 26, 32, 33, 34],
    coords: [
      { lat: 28.670965520677640, lon: 77.13366146400278 },
      { lat: 28.670965520677640, lon: 77.13366200000000 },
      { lat: 28.671002348834990, lon: 77.13365845073096 },
      { lat: 28.671008778430020, lon: 77.13366743178476 },
      { lat: 28.671009000000000, lon: 77.13366800000000 },
      { lat: 28.671009200000000, lon: 77.13366850000000 },
    ],
  },
};

// ── Tools ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "navigate_to_room",
      description: "Navigate from one room to another. ONLY call this when the user names an explicit destination in this message, e.g. 'take me to X', 'navigate to X', 'go to X'. NEVER call this for a bare follow-up like 'navigate', 'go', or 'start' with no destination named — that means the route is already set and the user wants start_preview_route instead.",
      parameters: {
        type: "object",
        properties: {
          from_room: { type: "string", description: "Starting room name (use the first room in the navigation dropdown)" },
          to_room: { type: "string", description: "Destination room name" },
        },
        required: ["from_room", "to_room"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_person",
      description: "Navigate to a person's desk. ONLY call this when the user names an explicit person in this message, e.g. 'take me to X', 'navigate to X', 'go to X', 'show me the way to X'. NOT for 'who sits next to X' or info questions. NEVER call this for a bare follow-up like 'navigate', 'go', or 'start' with no person named — that means the route is already set and the user wants start_preview_route instead.",
      parameters: {
        type: "object",
        properties: {
          person_name: { type: "string", description: "Name of the person" },
        },
        required: ["person_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_room_availability",
      description: "ALWAYS call this when asked if a room is free, available, occupied, or booked. This tool has LIVE real-time access to the office calendar — it will return the actual current status and next booking time. Never say you lack real-time access; always call this tool instead.",
      parameters: {
        type: "object",
        properties: {
          room_name: { type: "string", description: "Room name (e.g. 'Dojo', 'Manthan', 'Conference Room')" },
        },
        required: ["room_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_booking_panel",
      description: "Open the booking panel to book a room",
      parameters: {
        type: "object",
        properties: {
          room_name: { type: "string", description: "Room name to book" },
        },
        required: ["room_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_floor",
      description: "Switch the 3D building view to a specific floor",
      parameters: {
        type: "object",
        properties: {
          floor: { type: "string", enum: ["all", "2nd", "3rd"], description: "Floor name: 'all'=show full building/outdoor view (all floors), '2nd'=employee floor with Dojo/Manthan/Eureka, '3rd'=employee floor with Conference Room." },
        },
        required: ["floor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_room",
      description: "Highlight a specific room with a red marker dot on the map without navigating. Use for 'show me', 'where is', 'highlight', 'point to' requests.",
      parameters: {
        type: "object",
        properties: {
          room_name: { type: "string", description: "Room name to highlight" },
        },
        required: ["room_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_free_space",
      description: "Show open floor areas (not chairs/seats) with red dot markers — use when user asks about empty floor space, where to place a locker/printer/furniture, or 'mark free space'",
      parameters: {
        type: "object",
        properties: {
          floor_name: { type: "string", description: "'2nd floor' or '3rd floor'" },
          item_description: { type: "string", description: "Item to place (e.g., locker, printer)" },
        },
        required: ["floor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_vacant_seats",
      description: "Blink the unoccupied EMPLOYEE CHAIR SEATS in red — use only when user asks about vacant/unassigned/empty chairs or seats, NOT open floor areas",
      parameters: {
        type: "object",
        properties: {
          floor_name: { type: "string", description: "'2nd floor' or '3rd floor'" },
        },
        required: ["floor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_assigned_seats",
      description: "Blink the assigned (named employee) seat chair models on the floor in green",
      parameters: {
        type: "object",
        properties: {
          floor_name: { type: "string", description: "'2nd floor' or '3rd floor'" },
        },
        required: ["floor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_person_desk",
      description: "Show a red marker dot at a specific person's desk location. Use for 'where does X sit', 'highlight X desk', 'show X seat'.",
      parameters: {
        type: "object",
        properties: {
          person_name: { type: "string", description: "Name of the person whose desk to highlight" },
        },
        required: ["person_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_meeting_room",
      description: "Recommend and highlight the best meeting room for given attendee count and purpose",
      parameters: {
        type: "object",
        properties: {
          attendees: { type: "integer", description: "Number of people" },
          purpose: { type: "string", description: "Meeting purpose (presentation, board, brainstorm, etc.)" },
        },
        required: ["attendees"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "outdoor_to_indoor_navigation",
      description: "Set up route from an external location (address, metro station, landmark) to the FloData building for outdoor-to-indoor navigation",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Starting location (e.g. 'Punjabi Bagh Metro Station, Delhi')" },
        },
        required: ["origin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_markers",
      description: "Clear all highlight markers/pins and stop seat blinking on the map. NOT for clearing a navigation route — use clear_route for that.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_route",
      description: "Clear the currently drawn navigation route from the map and reset the Map Route panel. Use for 'clear the route', 'remove the route', 'cancel navigation', 'start over with directions'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sign_in",
      description: "Sign the user in with Google. Use for 'sign in', 'log in', 'connect my account'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sign_out",
      description: "Sign the user out. Use for 'sign out', 'log out', 'log me out'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "open_notifications",
      description: "Open the notifications panel showing the signed-in user's recent notifications. Use for 'open notifications', 'show my notifications', 'any updates for me'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "book_room",
      description: "Book a meeting room for a specific date and time range. ALWAYS require an explicit start AND end time in THIS message — if the user hasn't given a time, ask them for one instead of guessing. Bookable rooms: Dojo, Eureka, Manthan, Meeting Room, Conference Room.",
      parameters: {
        type: "object",
        properties: {
          room_name: { type: "string", description: "Room to book" },
          date: { type: "string", description: "Date as 'today', 'tomorrow', or YYYY-MM-DD. Resolve relative dates using the current date given in your system instructions." },
          start_time: { type: "string", description: "Start time in 24-hour HH:MM format, e.g. '15:00' for 3pm" },
          end_time: { type: "string", description: "End time in 24-hour HH:MM format" },
        },
        required: ["room_name", "date", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancel the signed-in user's own upcoming booking for a room. Use for 'cancel my booking', 'cancel X', 'free up X', 'release my reservation'.",
      parameters: {
        type: "object",
        properties: {
          room_name: { type: "string", description: "Room whose booking should be cancelled" },
        },
        required: ["room_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "raise_complaint",
      description: "Open the complaint form pre-filled for a room or a person's chair/seat. Use when the user wants to report a problem, file/raise a complaint, or says something is broken, not working, dirty, or damaged, and names a room or a person.",
      parameters: {
        type: "object",
        properties: {
          target_name: { type: "string", description: "Room name or person's name whose seat/chair has the issue" },
          target_kind: { type: "string", enum: ["room", "person"], description: "Whether target_name refers to a room or a person's seat" },
          issue_description: { type: "string", description: "Short description of the problem, if the user gave one, e.g. 'AC not cooling' or 'projector screen broken'" },
        },
        required: ["target_name", "target_kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_my_complaints",
      description: "Open the My Complaints panel, showing the signed-in user's previously raised complaints and their current status. Use for 'my complaints', 'status of my complaint', 'show my reports'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "start_preview_route",
      description: "Start a cinematic camera fly-through preview of the current navigation route. ALWAYS call this when user says 'preview route', 'camera view', 'fly through', 'show route preview', 'start preview', 'camera fly', 'cinematic view', or any similar phrase about previewing/flying the route. ALSO call this for a bare go-ahead with no destination named, such as 'start', 'go', 'navigate', 'begin', or 'let's go' — these mean the route is already set up and the user wants to begin moving now.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Core ────────────────────────────────────────────────────────────

export function initAssistant(cbs: AssistantCallbacks): void {
  callbacks = cbs;
}

function buildSystemPrompt(rooms: string[], people: string[]): string {
  return `You are the FloData Building Assistant — an AI embedded in a 3D interactive map of FloData Analytics office, Delhi. You ONLY answer questions about this building. You have no knowledge of the outside world for answering purposes.

${BUILDING_KNOWLEDGE}

Navigation rooms available: ${rooms.join(", ")}
Registered people: ${people.join(", ")}
Current date/time: ${new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} — use this to resolve "today"/"tomorrow"/relative dates for bookings. When calling book_room, output the date as YYYY-MM-DD.

━━━ SCOPE RULE (HIGHEST PRIORITY) ━━━
If the user's question is NOT about this building (rooms, floors, seats, people, navigation, meetings, facilities), respond ONLY with:
"I'm your FloData building assistant — I can only help with questions about this office. Try asking me about rooms, navigation, seating, or meeting spaces!"
Do NOT attempt to answer general knowledge, math, coding, weather, news, jokes, or any other off-topic question.

━━━ UNDERSTANDING USER INTENT ━━━
Map informal/shorthand phrases to the right action:

NAVIGATION (use navigate_to_room / navigate_to_person):
  "take me to X", "go to X", "I need to reach X", "walk me to X", "how do I get to X", "directions to X", "navigate to X"
  → navigate_to_room or navigate_to_person. Requires an explicit destination in THIS message — never re-run
  this from a bare word alone; a standalone "navigate"/"go"/"start" with no destination named means the
  route is already set up and the user wants to begin moving, so use start_preview_route instead (see below).

LOCATE / SHOW (use highlight_room / highlight_person_desk):
  "where is", "show me", "find", "point to", "locate", "mark", "highlight"
  → highlight_room or highlight_person_desk (NO navigation)

FLOOR INFO (use show_floor):
  "switch to 2nd floor", "show 3rd floor", "change floor"
  "show all floors", "full building", "outdoor view", "show whole building", "all floors"
  → show_floor (use 'all' for full-building/outdoor, otherwise the specific floor)

SEAT QUESTIONS (answer from knowledge, no tool):
  "who sits next to X", "X's neighbor", "beside X", "near X"
  → Answer directly from seating knowledge. Do NOT navigate.

VACANT SEATS (use highlight_vacant_seats):
  "empty seats", "free chairs", "unoccupied seats", "available desks"
  → highlight_vacant_seats

FREE FLOOR SPACE (use suggest_free_space):
  "empty floor space", "where to put a locker/printer/furniture", "free area"
  → suggest_free_space. NEVER use highlight_vacant_seats for this.

MEETING ROOM (use recommend_meeting_room):
  "book for X people", "we are X people", "room for a meeting of X", "best room for presentation"
  → recommend_meeting_room

AVAILABILITY (ALWAYS use check_room_availability — NEVER reply with text about not having real-time access):
  "is X free", "is X available", "is X occupied", "can I use X now", "who booked X", "when is X free"
  → check_room_availability (this tool has LIVE calendar access and returns the real current status)

BOOKING (use book_room):
  "book X tomorrow 3-4pm", "reserve X for 2-3pm today", "schedule X at 10am for an hour"
  → book_room. Requires an explicit start AND end time in THIS message — if no time is given,
  ask a short clarifying question instead of guessing one.

CANCEL BOOKING (use cancel_booking):
  "cancel my booking for X", "cancel X", "free up X", "release my reservation"
  → cancel_booking

COMPLAINTS (use raise_complaint):
  "report an issue with X", "raise a complaint about X", "X is broken/not working/dirty/damaged", "file a complaint for X"
  → raise_complaint. target_kind="room" for rooms/facilities, target_kind="person" for a person's chair/seat.

MY COMPLAINTS (use show_my_complaints):
  "my complaints", "status of my complaint", "show my reports", "what did I report"
  → show_my_complaints

APP CONTROLS:
  "clear the route", "remove the route", "start over with directions" → clear_route (NOT clear_markers)
  "sign in", "log in", "connect my account" → sign_in
  "sign out", "log out", "log me out" → sign_out
  "open notifications", "show my notifications", "any updates for me" → open_notifications

OUTDOOR → INDOOR (use outdoor_to_indoor_navigation):
  Any starting point outside the building (metro, landmark, address)
  → outdoor_to_indoor_navigation

PREVIEW ROUTE / CAMERA VIEW (use start_preview_route):
  "preview route", "camera view", "fly through", "show route preview", "start preview", "cinematic", "camera fly",
  and ALSO any bare go-ahead with no destination named — "start", "go", "navigate", "begin", "let's go", "start navigation"
  → start_preview_route (ALWAYS call this tool, never describe it, never re-call navigate_to_room/navigate_to_person for these)

━━━ RESPONSE STYLE ━━━
- Be concise and direct — 1-2 sentences max for informational answers.
- Sound like a helpful office guide, not a chatbot.
- For ambiguous input, ask one short clarifying question rather than guessing.
- Never make up room names, people, or seat data not in the knowledge above.
- NEVER say "I don't have access to real-time data" — you have live tools for that. Call the tool.`;
}

const OFF_TOPIC_PATTERNS = [
  /\b(weather|forecast|temperature|rain|sun|wind)\b/i,
  /\b(joke|funny|laugh|humor|pun)\b/i,
  /\b(recipe|cook|food|restaurant|eat)\b/i,
  /\b(stock|crypto|bitcoin|market|price|invest)\b/i,
  /\b(news|politics|election|government|president|pm)\b/i,
  /\b(sport|cricket|football|ipl|match|score)\b/i,
  /\b(movie|film|song|music|netflix|youtube|celebrity)\b/i,
  /\b(translate|language|grammar|spell)\b/i,
  /^[\d\s\+\-\*\/\(\)\.]+$/, // pure math expression
];
const BUILDING_OFF_TOPIC_REPLY =
  "I'm your FloData building assistant — I can only help with questions about this office. Try asking me about rooms, navigation, seating, or meeting spaces!";

// ── Client-side floor shortcuts (bypass LLM scope filter) ─────────
const FLOOR_SHORTCUTS: { pattern: RegExp; floor: number; label: string }[] = [
  { pattern: /\b(all floors?|full build|whole build|show all|all floor|all level|every floor|every level|outdoor view|outside view|go home|home view|reset view|reset the view|zoom out)\b/i, floor: 0, label: "All Floors (full building / outdoor view)" },
  { pattern: /\b(2nd floor|second floor|floor 2|dojo|manthan|eureka)\b/i, floor: 3, label: "2nd Floor" },
  { pattern: /\b(3rd floor|third floor|floor 3|conference|library|lounge)\b/i, floor: 4, label: "3rd Floor" },
];

export async function handleAssistantQuery(userText: string): Promise<string> {
  if (!callbacks) return "Assistant not initialized.";

  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  if (!apiKey) return "Groq API key not set. Add VITE_GROQ_API_KEY to your .env file.";

  // ── Direct floor shortcut — handle before LLM to avoid scope-rule false positives ──
  const trimmed = userText.trim();
  for (const { pattern, floor, label } of FLOOR_SHORTCUTS) {
    if (pattern.test(trimmed)) {
      callbacks.showFloor(floor);
      const reply = `Switched to ${label}.`;
      history.push({ role: "user", content: userText });
      history.push({ role: "assistant", content: reply });
      return reply;
    }
  }

  // Fast client-side off-topic guard — skip API call for obvious mismatches
  if (OFF_TOPIC_PATTERNS.some((p) => p.test(trimmed))) {
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: BUILDING_OFF_TOPIC_REPLY });
    return BUILDING_OFF_TOPIC_REPLY;
  }

  const rooms = callbacks.getRoomNames();
  const people = callbacks.getPersonNames();

  history.push({ role: "user", content: userText });

  const body = JSON.stringify({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      { role: "system", content: buildSystemPrompt(rooms, people) },
      ...history.slice(-4),
    ],
    tools: TOOLS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 200,
  });

  let res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body,
  });

  // Auto-retry once on rate limit — parse suggested wait time from error
  if (res.status === 429) {
    const errText = await res.text();
    const seconds = parseFloat(errText.match(/try again in ([\d.]+)s/i)?.[1] ?? "5");
    await new Promise((r) => setTimeout(r, Math.ceil(seconds * 1000) + 500));
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
    });
  }

  if (!res.ok) throw new Error(await res.text());

  const data = await res.json() as any;
  const choice = data.choices?.[0];

  // Some models output tool calls as XML text — parse and normalise
  let toolCall: { name: string; args: Record<string, any> } | null = null;

  if (choice?.finish_reason === "tool_calls" && choice.message?.tool_calls?.length) {
    const raw = choice.message.tool_calls[0];
    toolCall = { name: raw.function.name, args: JSON.parse(raw.function.arguments ?? "{}") };
  } else if (choice?.message?.content) {
    const text: string = choice.message.content;
    // Match <tool_name>{"key":"val"}</tool_name> or <tool_name>{"key":"val"} </function>
    const xmlMatch = text.match(/<(\w+)>\s*(\{[\s\S]*?\})\s*<\/?\w*>/);
    if (xmlMatch) {
      try { toolCall = { name: xmlMatch[1], args: JSON.parse(xmlMatch[2]) }; } catch { /* ignore */ }
    }
  }

  if (toolCall) {
    const { name, args } = toolCall;
    let result = "";

    try {
      if (name === "navigate_to_room") {
        await callbacks!.navigateToRoom(args.from_room, args.to_room);
        result = `Navigating from ${args.from_room} to ${args.to_room}.`;

      } else if (name === "navigate_to_person") {
        await callbacks!.navigateToPerson(args.person_name);
        result = `Navigating to ${args.person_name}'s desk.`;

      } else if (name === "check_room_availability") {
        result = await callbacks!.checkAvailability(args.room_name);

      } else if (name === "open_booking_panel") {
        callbacks!.openBooking(args.room_name);
        result = `Opening booking panel for ${args.room_name}.`;

      } else if (name === "show_floor") {
        const raw = String(args.floor).toLowerCase().replace(/\s*(floor|fl)\.?/i, "").trim();
        const floorMap: Record<string, number> = { all: 0, "2nd": 3, "3rd": 4 };
        const floorNum = floorMap[raw] ?? 3;
        callbacks!.showFloor(floorNum);
        const labels: Record<number, string> = { 0: "All Floors (full building / outdoor view)", 3: "2nd Floor (employee)", 4: "3rd Floor (employee)" };
        result = `Switched to ${labels[floorNum]}.`;

      } else if (name === "highlight_room") {
        const key = args.room_name as string;
        const match = Object.entries(ROOM_COORDS).find(([k]) =>
          k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase())
        );
        if (match) {
          const [roomKey, coord] = match;
          callbacks!.showFloor(coord.floor);
          callbacks!.showMarkers([{ lat: coord.lat, lon: coord.lon, label: roomKey }], coord.floor);
          const floorLabel = coord.floor === 4 ? "3rd floor" : "2nd floor";
          result = `${roomKey} is on the ${floorLabel}. Highlighted with a red marker.`;
        } else {
          result = `Could not find room "${key}" in the building.`;
        }

      } else if (name === "suggest_free_space") {
        const key = (args.floor_name as string).toLowerCase().includes("3") ? "3rd floor" : "2nd floor";
        const floorNum = key === "3rd floor" ? 4 : 3;
        const spaces = FREE_SPACES[key] ?? [];
        callbacks!.showFloor(floorNum);
        callbacks!.showMarkers(spaces, floorNum);
        const item = args.item_description ? ` for a ${args.item_description}` : "";
        result = `Showing ${spaces.length} free spaces${item} on ${key} with red dots: ${spaces.map((s) => s.label).join(", ")}.`;

      } else if (name === "highlight_vacant_seats") {
        const key = (args.floor_name as string).toLowerCase().includes("3") ? "3rd floor" : "2nd floor";
        const seatData = VACANT_SEAT_INDICES[key];
        callbacks!.showFloor(seatData.floor);
        callbacks!.blinkChairs(seatData.indices, seatData.floor, "red");
        result = `Blinking ${seatData.indices.length} unassigned seats on ${key} in red.`;

      } else if (name === "highlight_assigned_seats") {
        const key = (args.floor_name as string).toLowerCase().includes("3") ? "3rd floor" : "2nd floor";
        const seatData = ASSIGNED_SEAT_INDICES[key];
        callbacks!.showFloor(seatData.floor);
        callbacks!.blinkChairs(seatData.indices, seatData.floor, "green");
        result = `Blinking ${seatData.indices.length} assigned seats on ${key} in green.`;

      } else if (name === "highlight_person_desk") {
        const nameKey = (args.person_name as string).toLowerCase().trim();
        const match = Object.entries(PERSON_DESKS).find(([k]) => k.includes(nameKey) || nameKey.includes(k));
        const desk = match?.[1];
        if (desk && match) {
          callbacks!.showFloor(desk.floor);
          // Use the matched canonical key (e.g. "samata"), not the raw LLM-extracted
          // person_name — that can carry extra text ("Samata's desk") that fails an
          // exact chair-name lookup even though it matched here via substring.
          void callbacks!.bounceSeat(match[0], desk.floor);
          const floorLabel = desk.floor === 4 ? "3rd floor" : "2nd floor";
          result = `${args.person_name}'s seat is on ${floorLabel} — watch it hop.`;
        } else {
          result = `Could not find desk for "${args.person_name}". They may not have an assigned seat in the system.`;
        }

      } else if (name === "recommend_meeting_room") {
        const n = args.attendees as number;
        const purpose = ((args.purpose ?? "") as string).toLowerCase();
        let roomName = "";
        let rec = "";
        if (n <= 4) { roomName = "Dojo"; rec = `For ${n} people → Dojo (2nd floor, 4 seats, 1 table). Eureka also works if you need the big LED screen/TV.`; }
        else if (n <= 6) { roomName = "Eureka"; rec = `For ${n} people → Eureka (2nd floor, 6 seats, big LED screen/TV and locker).`; }
        else if (n <= 9) { roomName = "Manthan"; rec = `For ${n} people → Manthan (2nd floor, 9 seats, TV and round table).`; }
        else if (n <= 12) {
          roomName = "Conference Room";
          rec = `For ${n} people → Conference Room (3rd floor, 12 seats, round table, LED display and AC).`;
        } else {
          roomName = "Conference Room";
          rec = `For ${n} people there is no configured room with enough seats. The largest listed room is Conference Room with 12 seats.`;
        }
        if (purpose.includes("present") || purpose.includes("train")) { roomName = n <= 6 ? "Eureka" : "Conference Room"; rec += " Use Eureka for smaller presentations or Conference Room for larger ones."; }
        const coord = ROOM_COORDS[roomName];
        if (coord) { callbacks!.showFloor(coord.floor); callbacks!.showMarkers([{ lat: coord.lat, lon: coord.lon, label: roomName }], coord.floor); }
        result = rec;

      } else if (name === "outdoor_to_indoor_navigation") {
        callbacks!.triggerOutdoorNav(args.origin as string, "FloData Analytics, 28 Shivaji Marg, Delhi");
        result = `Opening map directions from "${args.origin}" to FloData Analytics building. Follow the route to reach the building, then switch to indoor navigation.`;

      } else if (name === "book_room") {
        result = await callbacks!.bookRoom(args.room_name, args.date, args.start_time, args.end_time);

      } else if (name === "cancel_booking") {
        result = await callbacks!.cancelMyBooking(args.room_name);

      } else if (name === "raise_complaint") {
        const key = String(args.target_name).toLowerCase().trim();
        if (args.target_kind === "room") {
          const match = Object.entries(ROOM_COORDS).find(([k]) =>
            k.toLowerCase().includes(key) || key.includes(k.toLowerCase())
          );
          if (match) {
            const [roomKey, coord] = match;
            callbacks!.raiseComplaintForRoom(roomKey, coord.floor as 3 | 4, args.issue_description);
            result = `Opening a complaint form for ${roomKey}.`;
          } else {
            result = `Could not find room "${args.target_name}" in the building.`;
          }
        } else {
          const match = Object.entries(PERSON_DESKS).find(([k]) => k.includes(key) || key.includes(k));
          if (match) {
            const [personKey, desk] = match;
            await callbacks!.raiseComplaintForPerson(personKey, desk.floor as 3 | 4, args.issue_description);
            result = `Opening a complaint form for ${args.target_name}'s seat.`;
          } else {
            result = `Could not find "${args.target_name}" in the seating directory.`;
          }
        }

      } else if (name === "show_my_complaints") {
        callbacks!.showMyComplaints();
        result = "Opening your complaints.";

      } else if (name === "clear_markers") {
        callbacks!.clearMarkers();
        result = "Cleared all markers from the map.";

      } else if (name === "clear_route") {
        callbacks!.clearRoute();
        result = "Route cleared.";

      } else if (name === "sign_in") {
        await callbacks!.signIn();
        result = "Signing you in with Google.";

      } else if (name === "sign_out") {
        await callbacks!.signOutUser();
        result = "You've been signed out.";

      } else if (name === "open_notifications") {
        callbacks!.openNotifications();
        result = "Opening your notifications.";

      } else if (name === "start_preview_route") {
        if (callbacks!.startPreviewRoute) {
          callbacks!.startPreviewRoute();
          result = "Starting camera preview of the route.";
        } else {
          result = "Preview route is not available right now. Please set a navigation route first.";
        }
      }

    } catch (err) {
      result = `Action failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    history.push({ role: "assistant", content: result });
    return result;
  }

  const text: string = (choice?.message?.content ?? "Sorry, I couldn't process that.")
    .replace(/<\w+>\s*\{[\s\S]*?\}\s*<\/?\w*>/g, "").trim(); // strip any leftover XML tool tags
  const reply = text || "Done.";
  history.push({ role: "assistant", content: reply });
  return reply;
}

export function clearAssistantHistory(): void {
  history.length = 0;
}
