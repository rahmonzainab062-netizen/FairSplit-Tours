import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, stringAsciiCV, uintCV, principalCV, noneCV, someCV, tupleCV, listCV, booleanCV } from "@stacks/transactions";

const ERR_INVALID_TOTAL = 1000;
const ERR_INVALID_PARTICIPANT = 1001;
const ERR_INVALID_ROLE = 1002;
const ERR_TOUR_NOT_FOUND = 1003;
const ERR_TOUR_CLOSED = 1004;
const ERR_INVALID_AMOUNT = 1005;
const ERR_ALREADY_REGISTERED = 1006;
const ERR_AUTHORITY_NOT_SET = 1007;
const ERR_NOT_AUTHORIZED = 1008;
const ERR_INVALID_WEIGHT = 1009;

interface TourSplit {
  totalCost: number;
  maxParticipants: number;
  roleWeights: Array<{ role: string; weight: number }>;
  currentParticipants: number;
  status: boolean;
}

interface ParticipantShare {
  share: number;
  role: string;
  paid: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CostSplitterMock {
  state: {
    authorityContract: string | null;
    defaultSplitRule: number;
    tourSplits: Map<number, TourSplit>;
    participantShares: Map<string, ParticipantShare>;
  } = {
    authorityContract: null,
    defaultSplitRule: 1,
    tourSplits: new Map(),
    participantShares: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);

  constructor() {
    this.reset();
  }

  reset(): void {
    this.state = {
      authorityContract: null,
      defaultSplitRule: 1,
      tourSplits: new Map(),
      participantShares: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
  }

  setAuthorityContract(contract: string): Result<boolean> {
    if (contract === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.authorityContract !== null) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.state.authorityContract = contract;
    return { ok: true, value: true };
  }

  getTourSplit(tourId: number): TourSplit | null {
    return this.state.tourSplits.get(tourId) || null;
  }

  getParticipantShare(tourId: number, participant: string): ParticipantShare | null {
    return this.state.participantShares.get(`${tourId}-${participant}`) || null;
  }

  calculateShare(tourId: number, role: string): Result<number> {
    const tour = this.state.tourSplits.get(tourId);
    if (!tour) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    if (!tour.status) return { ok: false, value: ERR_TOUR_CLOSED };
    const weight = tour.roleWeights.find(w => w.role === role)?.weight ?? 100;
    const orgWeight = tour.roleWeights.find(w => w.role === "organizer")?.weight ?? 100;
    const adjustedTotal = tour.currentParticipants * 100 + (100 - orgWeight);
    return { ok: true, value: Math.floor((tour.totalCost * weight) / adjustedTotal) };
  }

  updateSplit(tourId: number, totalCost: number, maxParticipants: number, roleWeights: Array<{ role: string; weight: number }>): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    if (!this.authorities.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (maxParticipants <= 0) return { ok: false, value: ERR_INVALID_PARTICIPANT };
    if (totalCost <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (!roleWeights.every(w => w.weight > 0 && w.weight <= 1000)) return { ok: false, value: ERR_INVALID_WEIGHT };
    const tour = this.state.tourSplits.get(tourId);
    if (!tour) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    this.state.tourSplits.set(tourId, { ...tour, totalCost, maxParticipants, roleWeights });
    return { ok: true, value: true };
  }

  addParticipant(tourId: number, role: string): Result<number> {
    const tour = this.state.tourSplits.get(tourId);
    if (!tour) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    if (!tour.status) return { ok: false, value: ERR_TOUR_CLOSED };
    if (tour.currentParticipants >= tour.maxParticipants) return { ok: false, value: ERR_INVALID_PARTICIPANT };
    if (this.state.participantShares.has(`${tourId}-${this.caller}`)) return { ok: false, value: ERR_ALREADY_REGISTERED };
    const shareResult = this.calculateShare(tourId, role);
    if (!shareResult.ok) return shareResult;
    this.state.participantShares.set(`${tourId}-${this.caller}`, { share: shareResult.value, role, paid: false });
    this.state.tourSplits.set(tourId, { ...tour, currentParticipants: tour.currentParticipants + 1 });
    return shareResult;
  }

  closeTour(tourId: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    if (!this.authorities.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const tour = this.state.tourSplits.get(tourId);
    if (!tour) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    this.state.tourSplits.set(tourId, { ...tour, status: false });
    return { ok: true, value: true };
  }

  validateSplit(tourId: number): Result<boolean> {
    const tour = this.state.tourSplits.get(tourId);
    if (!tour) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    const share = this.calculateShare(tourId, "participant");
    if (!share.ok) return { ok: false, value: ERR_TOUR_CLOSED };
    return { ok: true, value: tour.totalCost === share.value * tour.currentParticipants };
  }
}

describe("CostSplitter", () => {
  let contract: CostSplitterMock;

  beforeEach(() => {
    contract = new CostSplitterMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result).toEqual({ ok: false, value: ERR_NOT_AUTHORIZED });
  });

  it("rejects participant addition to non-existent tour", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addParticipant(99, "participant");
    expect(result).toEqual({ ok: false, value: ERR_TOUR_NOT_FOUND });
  });

  it("rejects duplicate participant registration", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.tourSplits.set(1, {
      totalCost: 1000,
      maxParticipants: 5,
      roleWeights: [{ role: "participant", weight: 100 }],
      currentParticipants: 0,
      status: true
    });
    contract.addParticipant(1, "participant");
    const result = contract.addParticipant(1, "participant");
    expect(result).toEqual({ ok: false, value: ERR_ALREADY_REGISTERED });
  });

  it("updates tour split successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.tourSplits.set(1, {
      totalCost: 1000,
      maxParticipants: 5,
      roleWeights: [{ role: "participant", weight: 100 }],
      currentParticipants: 0,
      status: true
    });
    const result = contract.updateSplit(1, 2000, 10, [{ role: "participant", weight: 100 }, { role: "organizer", weight: 50 }]);
    expect(result).toEqual({ ok: true, value: true });
    const tour = contract.getTourSplit(1);
    expect(tour?.totalCost).toBe(2000);
    expect(tour?.maxParticipants).toBe(10);
  });

  it("rejects update by non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.tourSplits.set(1, {
      totalCost: 1000,
      maxParticipants: 5,
      roleWeights: [{ role: "participant", weight: 100 }],
      currentParticipants: 0,
      status: true
    });
    contract.caller = "ST3FAKE";
    contract.authorities = new Set();
    const result = contract.updateSplit(1, 2000, 10, [{ role: "participant", weight: 100 }]);
    expect(result).toEqual({ ok: false, value: ERR_NOT_AUTHORIZED });
  });

  it("closes tour successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.tourSplits.set(1, {
      totalCost: 1000,
      maxParticipants: 5,
      roleWeights: [{ role: "participant", weight: 100 }],
      currentParticipants: 0,
      status: true
    });
    const result = contract.closeTour(1);
    expect(result).toEqual({ ok: true, value: true });
    const tour = contract.getTourSplit(1);
    expect(tour?.status).toBe(false);
  });

  it("validates split correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.tourSplits.set(1, {
      totalCost: 1000,
      maxParticipants: 5,
      roleWeights: [{ role: "participant", weight: 100 }],
      currentParticipants: 5,
      status: true
    });
    const result = contract.validateSplit(1);
    expect(result).toEqual({ ok: true, value: true });
  });
});