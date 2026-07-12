import { describe, expect, it } from "vitest";

import { maxRoomLevel } from "../src/blueprint";
import type { RoomKind } from "../src/types";

describe("blueprint room levels", () => {
  it.each<[RoomKind, number]>([
    ["control_center", 5],
    ["dormitory", 5],
    ["trade_post", 3],
    ["factory", 3],
    ["power_plant", 3],
    ["office", 3],
    ["meeting_room", 3],
    ["workshop", 3],
  ])("limits %s rooms to level %i", (kind, expected) => {
    expect(maxRoomLevel(kind)).toBe(expected);
  });
});
