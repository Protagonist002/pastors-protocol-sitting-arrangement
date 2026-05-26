import { describe, expect, it } from 'vitest';
import { buildControlCenterModel } from './controlCenter';

const auditorium = {
  sections: [
    { id: 'main', label: 'Main', color: '#2471a3' },
    { id: 'side', label: 'Side', color: '#b8920a' },
  ],
  default_seating_config: {
    main: { rows: 2, cols: 2 },
    side: { rows: 1, cols: 2 },
  },
};

const conference = {
  id: 'conf-1',
  name: 'Test Conference',
  auditorium,
  created_at: '2026-05-20T09:00:00Z',
  updated_at: '2026-05-20T09:00:00Z',
};

const sessions = [
  {
    id: 'session-1',
    name: 'Opening Session',
    seating_config: { main: { rows: 2, cols: 2 }, side: { rows: 1, cols: 2 } },
    created_at: '2026-05-20T10:00:00Z',
  },
];

const roster = [
  {
    id: 'roster-1',
    name: 'Bishop Ada',
    title: 'Bishop',
    first_arrival_at: '2026-05-20T10:15:00Z',
    created_at: '2026-05-20T09:20:00Z',
  },
  {
    id: 'roster-2',
    name: 'Pastor Ben',
    title: 'Pastor',
    created_at: '2026-05-20T09:25:00Z',
  },
  {
    id: 'roster-3',
    name: 'Dr Cee',
    title: 'Guest',
    created_at: '2026-05-20T09:30:00Z',
  },
];

const users = [
  { id: 'user-1', full_name: 'Protocol One', role: 'protocol' },
  { id: 'user-2', full_name: 'Protocol Two', role: 'protocol' },
  { id: 'admin-1', full_name: 'Admin', role: 'admin' },
];

describe('control center model', () => {
  it('builds summary metrics from roster, assignments, and session dignitaries', () => {
    const model = buildControlCenterModel({
      conference,
      sessions,
      roster,
      users,
      assignments: [
        {
          user_id: 'user-1',
          conference_id: 'conf-1',
          conference_role: 'Escort',
          assigned_conference_dignitary_id: 'roster-1',
          created_at: '2026-05-20T10:01:00Z',
        },
      ],
      sessionDignitariesBySessionId: {
        'session-1': [
          {
            id: 'd1',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-1',
            name: 'Bishop Ada',
            title: 'Bishop',
            section: 'main',
            row_num: 1,
            col_num: 1,
            status: 'seated',
            updated_at: '2026-05-20T10:25:00Z',
          },
          {
            id: 'd2',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-2',
            name: 'Pastor Ben',
            title: 'Pastor',
            section: 'main',
            row_num: 1,
            col_num: 2,
            status: 'pending',
            updated_at: '2026-05-20T10:20:00Z',
          },
        ],
      },
    });

    expect(model.summary.expected).toBe(3);
    expect(model.summary.seated).toBe(1);
    expect(model.summary.pending).toBe(2);
    expect(model.summary.assignmentCoverage).toBe(33);
    expect(model.summary.seatingCompletion).toBe(100);
    expect(model.sessionRows[0].sections.find((section) => section.id === 'main').occupancy).toBe(50);
  });

  it('detects operational alerts for conflicts and missing coverage', () => {
    const model = buildControlCenterModel({
      conference,
      sessions,
      roster,
      users,
      assignments: [],
      sessionDignitariesBySessionId: {
        'session-1': [
          {
            id: 'd1',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-1',
            name: 'Bishop Ada',
            title: 'Bishop',
            section: 'main',
            row_num: 1,
            col_num: 1,
            status: 'arrived',
            updated_at: '2026-05-20T10:25:00Z',
          },
          {
            id: 'd2',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-2',
            name: 'Pastor Ben',
            title: 'Pastor',
            section: 'main',
            row_num: 1,
            col_num: 1,
            status: 'pending',
            updated_at: '2026-05-20T10:20:00Z',
          },
          {
            id: 'd3',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-3',
            name: 'Dr Cee',
            title: 'Guest',
            section: 'side',
            row_num: 3,
            col_num: 1,
            status: 'pending',
            updated_at: '2026-05-20T10:18:00Z',
          },
        ],
      },
    });

    expect(model.alerts.some((alert) => alert.title === 'Seat conflict')).toBe(true);
    expect(model.alerts.some((alert) => alert.title === 'Seat outside section')).toBe(true);
    expect(model.alerts.some((alert) => alert.title === 'No protocol officer')).toBe(true);
    expect(model.alerts.some((alert) => alert.title === 'Arrived, not seated')).toBe(true);
  });

  it('creates protocol rows and a searchable tracker', () => {
    const model = buildControlCenterModel({
      conference,
      sessions,
      roster,
      users,
      assignments: [
        {
          user_id: 'user-2',
          conference_id: 'conf-1',
          conference_role: 'Arrival Desk',
          assigned_conference_dignitary_id: 'roster-2',
          assigned_dignitary: roster[1],
          created_at: '2026-05-20T10:01:00Z',
        },
      ],
      sessionDignitariesBySessionId: {
        'session-1': [
          {
            id: 'd2',
            session_id: 'session-1',
            conference_dignitary_id: 'roster-2',
            name: 'Pastor Ben',
            title: 'Pastor',
            status: 'arrived',
            updated_at: '2026-05-20T10:20:00Z',
          },
        ],
      },
    });

    expect(model.protocolRows[0].user.id).toBe('user-2');
    expect(model.protocolRows[0].currentStatus).toBe('arrived');
    expect(model.trackerRows.find((row) => row.name === 'Pastor Ben').searchText).toContain('pastor ben');
    expect(model.feed[0].timestamp).toBeGreaterThanOrEqual(model.feed[model.feed.length - 1].timestamp);
  });
});
