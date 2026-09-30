// Descriptive details for the four seeded rooms. The database only knows a
// room's id and name; everything here is illustrative sample data for the
// prototype, not a claim about the real rooms' capacity or equipment.

export type Facility = "display" | "whiteboard" | "video" | "power" | "pinup" | "step-free";

export const FACILITY_LABEL: Record<Facility, string> = {
  display: "Wall display",
  whiteboard: "Whiteboard",
  video: "Video conferencing",
  power: "Power at every seat",
  pinup: "Pin-up wall",
  "step-free": "Step-free access",
};

export type SpaceDetails = {
  building: string;
  code: string;
  room: string;
  level: string;
  capacity: number;
  kind: string;
  facilities: Facility[];
  blurb: string;
};

const DETAILS: Record<number, SpaceDetails> = {
  1: {
    building: "Hanna Neumann",
    code: "HN",
    room: "Seminar Room",
    level: "Ground floor",
    capacity: 24,
    kind: "Seminar",
    facilities: ["display", "whiteboard", "video", "step-free"],
    blurb: "Long tables facing one big screen — good for walking a whole pod through a demo.",
  },
  2: {
    building: "CSIT",
    code: "CSIT",
    room: "N101",
    level: "Level 1",
    capacity: 40,
    kind: "Lab",
    facilities: ["display", "video", "power", "step-free"],
    blurb: "Rows of benches with power everywhere — for crits where everyone has a laptop open.",
  },
  3: {
    building: "Marie Reay",
    code: "MRTC",
    room: "Room 3",
    level: "Level 2",
    capacity: 16,
    kind: "Teaching room",
    facilities: ["whiteboard", "display", "power"],
    blurb: "A smaller, quieter room with whiteboards on three walls.",
  },
  4: {
    building: "Birch",
    code: "BIRCH",
    room: "Crit Studio",
    level: "Level 3",
    capacity: 10,
    kind: "Studio",
    facilities: ["pinup", "whiteboard", "power", "step-free"],
    blurb: "An open studio with a pin-up wall for printing out and critiquing work.",
  },
};

export function detailsFor(room: { id: number; name: string }): SpaceDetails {
  return (
    DETAILS[room.id] ?? {
      building: room.name.split(" — ")[0] ?? room.name,
      code: "",
      room: room.name.split(" — ").pop() ?? room.name,
      level: "",
      capacity: 0,
      kind: "Room",
      facilities: [],
      blurb: "",
    }
  );
}

export const BUILDINGS = [...new Set(Object.values(DETAILS).map((d) => d.building))];
