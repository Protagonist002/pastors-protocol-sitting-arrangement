import { getEffectiveConfig, getOpenSections, STATUSES } from './constants';

const VIP_TITLE_PATTERN = /\b(vvip|vip|set\s*man|bishop|apostle|governor|minister|h\.?e\.?|guest of honour|guest of honor|cec)\b/i;

export const statusLabels = Object.fromEntries(STATUSES.map((status) => [status.id, status.label]));

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compact(value) {
  return String(value || '').trim();
}

function getRosterId(dignitary) {
  return dignitary?.conference_dignitary_id || dignitary?.id || '';
}

function getDignitarySearchText(dignitary) {
  return [
    dignitary?.name,
    dignitary?.title,
    dignitary?.church,
    dignitary?.extension,
    dignitary?.assigned_protocol_name,
    dignitary?.conference_role,
  ].filter(Boolean).join(' ').toLowerCase();
}

function latestRecord(current, next) {
  if (!current) return next;
  const currentTime = Math.max(toTimestamp(current.updated_at), toTimestamp(current.created_at));
  const nextTime = Math.max(toTimestamp(next.updated_at), toTimestamp(next.created_at));
  return nextTime >= currentTime ? next : current;
}

function buildMaps({ roster, assignments, users, allSessionDignitaries }) {
  const assignmentByRosterId = new Map();
  assignments.forEach((assignment) => {
    if (assignment.assigned_conference_dignitary_id) {
      assignmentByRosterId.set(assignment.assigned_conference_dignitary_id, assignment);
    }
  });

  const userById = new Map(users.map((user) => [user.id, user]));
  const latestByRosterId = new Map();
  const rowsByRosterId = new Map();

  allSessionDignitaries.forEach((dignitary) => {
    const rosterId = dignitary.conference_dignitary_id;
    if (!rosterId) return;
    latestByRosterId.set(rosterId, latestRecord(latestByRosterId.get(rosterId), dignitary));
    if (!rowsByRosterId.has(rosterId)) rowsByRosterId.set(rosterId, []);
    rowsByRosterId.get(rosterId).push(dignitary);
  });

  const rosterById = new Map(roster.map((dignitary) => [getRosterId(dignitary), dignitary]));

  return {
    assignmentByRosterId,
    latestByRosterId,
    rosterById,
    rowsByRosterId,
    userById,
  };
}

function getStatusCounts(roster, latestByRosterId, rowsByRosterId) {
  const counts = {
    expected: roster.length,
    pending: 0,
    arrived: 0,
    seated: 0,
    absent: 0,
  };

  roster.forEach((dignitary) => {
    const rosterId = getRosterId(dignitary);
    const latest = latestByRosterId.get(rosterId);
    const rows = rowsByRosterId.get(rosterId) || [];
    const hasArrived = Boolean(dignitary.first_arrival_at) || rows.some((row) => row.status === 'arrived' || row.status === 'seated');
    const hasSeated = rows.some((row) => row.status === 'seated');
    const latestStatus = latest?.status;

    if (hasSeated) {
      counts.seated += 1;
    } else if (latestStatus === 'absent') {
      counts.absent += 1;
    } else if (hasArrived || latestStatus === 'arrived') {
      counts.arrived += 1;
    } else {
      counts.pending += 1;
    }
  });

  return counts;
}

function getSeatKey(dignitary) {
  if (!dignitary.section || !dignitary.row_num || !dignitary.col_num) return '';
  return `${dignitary.session_id}:${dignitary.section}:${dignitary.row_num}:${dignitary.col_num}`;
}

function buildSeatDiagnostics({ sessions, sessionDignitariesBySessionId, auditorium }) {
  const conflicts = [];
  const outOfBounds = [];
  const sessionRows = [];
  const seenSeats = new Map();

  sessions.forEach((session) => {
    const attendees = sessionDignitariesBySessionId[session.id] || [];
    const config = getEffectiveConfig(auditorium, session.seating_config);
    const openSections = getOpenSections(auditorium);
    const sectionRows = openSections.map((section) => {
      const sectionConfig = config[section.id] || { rows: 0, cols: 0 };
      const totalSeats = (sectionConfig.rows || 0) * (sectionConfig.cols || 0);
      const assigned = attendees.filter((dignitary) => dignitary.section === section.id);
      const seated = assigned.filter((dignitary) => dignitary.status === 'seated').length;
      const arrived = assigned.filter((dignitary) => dignitary.status === 'arrived').length;
      const pending = assigned.filter((dignitary) => dignitary.status === 'pending').length;
      const absent = assigned.filter((dignitary) => dignitary.status === 'absent').length;

      return {
        id: section.id,
        label: section.label,
        color: section.color,
        assigned: assigned.length,
        seated,
        arrived,
        pending,
        absent,
        totalSeats,
        occupancy: totalSeats ? Math.round((assigned.length / totalSeats) * 100) : 0,
      };
    });

    attendees.forEach((dignitary) => {
      const key = getSeatKey(dignitary);
      if (key) {
        if (!seenSeats.has(key)) seenSeats.set(key, []);
        seenSeats.get(key).push(dignitary);
      }

      if (dignitary.section && dignitary.row_num && dignitary.col_num) {
        const sectionConfig = config[dignitary.section];
        if (
          sectionConfig
          && (dignitary.row_num > sectionConfig.rows || dignitary.col_num > sectionConfig.cols)
        ) {
          outOfBounds.push({ session, dignitary, sectionConfig });
        }
      }
    });

    sessionRows.push({
      session,
      total: attendees.length,
      assignedSeats: attendees.filter((dignitary) => dignitary.section && dignitary.row_num && dignitary.col_num).length,
      unassignedSeats: attendees.filter((dignitary) => !dignitary.section || !dignitary.row_num || !dignitary.col_num).length,
      statusCounts: Object.fromEntries(
        STATUSES.map((status) => [
          status.id,
          attendees.filter((dignitary) => dignitary.status === status.id).length,
        ]),
      ),
      sections: sectionRows,
    });
  });

  seenSeats.forEach((dignitaries) => {
    if (dignitaries.length > 1) {
      conflicts.push(dignitaries);
    }
  });

  return { sessionRows, conflicts, outOfBounds };
}

function buildAlerts({ conference, sessions, roster, assignments, users, maps, diagnostics }) {
  const alerts = [];
  const { assignmentByRosterId, latestByRosterId, rowsByRosterId } = maps;

  const addAlert = (severity, title, detail, meta = {}) => {
    alerts.push({
      id: `${severity}:${title}:${detail}:${alerts.length}`,
      severity,
      title,
      detail,
      ...meta,
    });
  };

  if (!conference?.auditorium) {
    addAlert('high', 'No auditorium selected', 'This conference cannot show accurate seating intelligence until an auditorium is attached.');
  }

  if (sessions.length === 0) {
    addAlert('high', 'No sessions created', 'Create at least one session before the conference can be monitored live.');
  }

  if (roster.length === 0) {
    addAlert('medium', 'No conference dignitaries', 'The conference roster is empty, so arrivals and protocol coverage are not yet trackable.');
  }

  roster.forEach((dignitary) => {
    const rosterId = getRosterId(dignitary);
    const rows = rowsByRosterId.get(rosterId) || [];
    const latest = latestByRosterId.get(rosterId);
    const isAssignedToProtocol = Boolean(dignitary.assigned_protocol_user_id || assignmentByRosterId.get(rosterId));
    const hasArrived = Boolean(dignitary.first_arrival_at) || rows.some((row) => row.status === 'arrived' || row.status === 'seated');
    const hasSeated = rows.some((row) => row.status === 'seated');
    const isVip = VIP_TITLE_PATTERN.test(`${dignitary.title || ''} ${dignitary.name || ''}`);

    if (!isAssignedToProtocol) {
      addAlert(isVip ? 'high' : 'medium', 'No protocol officer', `${dignitary.name || 'A dignitary'} has no protocol officer assigned.`, { rosterId });
    }

    if (hasArrived && !hasSeated) {
      addAlert(isVip ? 'high' : 'medium', 'Arrived, not seated', `${dignitary.name || 'A dignitary'} has arrived but is not marked seated in any session.`, { rosterId });
    }

    if (!rows.length) {
      addAlert(isVip ? 'medium' : 'low', 'Not added to any session', `${dignitary.name || 'A dignitary'} is on the conference roster but absent from session seating.`, { rosterId });
    }

    if (isVip && (!latest || latest.status === 'pending') && !hasArrived) {
      addAlert('medium', 'Priority guest pending', `${dignitary.name || 'A priority dignitary'} is still pending.`, { rosterId });
    }
  });

  assignments.forEach((assignment) => {
    const user = assignment.user_profile || users.find((candidate) => candidate.id === assignment.user_id);
    if (assignment.conference_role && !assignment.assigned_conference_dignitary_id) {
      addAlert('low', 'Role without dignitary', `${user?.full_name || 'A protocol officer'} has a conference role but no assigned dignitary.`);
    }
  });

  diagnostics.conflicts.forEach((group) => {
    const first = group[0];
    addAlert(
      'high',
      'Seat conflict',
      `${group.map((dignitary) => dignitary.name).join(', ')} share ${first.section} R${first.row_num}/S${first.col_num}.`,
    );
  });

  diagnostics.outOfBounds.forEach(({ session, dignitary, sectionConfig }) => {
    addAlert(
      'high',
      'Seat outside section',
      `${dignitary.name} is placed at R${dignitary.row_num}/S${dignitary.col_num} in ${session.name}, beyond ${sectionConfig.rows}x${sectionConfig.cols}.`,
    );
  });

  diagnostics.sessionRows.forEach((sessionRow) => {
    sessionRow.sections.forEach((section) => {
      if (section.totalSeats > 0 && section.assigned > section.totalSeats) {
        addAlert('high', 'Section over capacity', `${sessionRow.session.name} ${section.label} has ${section.assigned}/${section.totalSeats} seats assigned.`);
      } else if (section.totalSeats > 0 && section.occupancy >= 90) {
        addAlert('medium', 'Section near capacity', `${sessionRow.session.name} ${section.label} is ${section.occupancy}% occupied.`);
      }
    });
  });

  return alerts.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

function buildProtocolRows({ users, assignments, roster, maps }) {
  const protocolUsers = users.filter((user) => user.role === 'protocol');
  const assignmentsByUser = new Map(assignments.map((assignment) => [assignment.user_id, assignment]));
  const { latestByRosterId, rowsByRosterId } = maps;

  return protocolUsers.map((user) => {
    const assignment = assignmentsByUser.get(user.id);
    const assignedRoster = roster.find((dignitary) => getRosterId(dignitary) === assignment?.assigned_conference_dignitary_id);
    const latest = latestByRosterId.get(assignment?.assigned_conference_dignitary_id);
    const rows = rowsByRosterId.get(assignment?.assigned_conference_dignitary_id) || [];
    const lastUpdate = rows.reduce((latestTime, row) => Math.max(latestTime, toTimestamp(row.updated_at), toTimestamp(row.created_at)), 0);

    return {
      user,
      assignment,
      assignedDignitary: assignment?.assigned_dignitary || assignedRoster || null,
      currentStatus: latest?.status || (assignedRoster?.first_arrival_at ? 'arrived' : 'pending'),
      lastUpdate,
      sessionTouchCount: rows.length,
    };
  }).sort((a, b) => {
    if (a.assignedDignitary && !b.assignedDignitary) return -1;
    if (!a.assignedDignitary && b.assignedDignitary) return 1;
    return (b.lastUpdate || 0) - (a.lastUpdate || 0);
  });
}

function buildFeed({ conference, sessions, roster, assignments, users, allSessionDignitaries }) {
  const userById = new Map(users.map((user) => [user.id, user]));
  const events = [];

  const addEvent = (type, label, detail, at, meta = {}) => {
    const timestamp = toTimestamp(at);
    if (!timestamp) return;
    events.push({
      id: `${type}:${timestamp}:${events.length}`,
      type,
      label,
      detail,
      at,
      timestamp,
      ...meta,
    });
  };

  addEvent('conference', 'Conference updated', conference?.name || 'Conference details changed', conference?.updated_at || conference?.created_at);

  sessions.forEach((session) => {
    addEvent('session', 'Session available', session.name, session.created_at || session.updated_at, { sessionId: session.id });
    if (session.updated_at && session.updated_at !== session.created_at) {
      addEvent('session', 'Session updated', session.name, session.updated_at, { sessionId: session.id });
    }
  });

  roster.forEach((dignitary) => {
    addEvent('roster', 'Dignitary added', `${dignitary.name} joined the conference roster`, dignitary.created_at, { rosterId: getRosterId(dignitary) });
    addEvent('arrival', 'First arrival recorded', `${dignitary.name} arrived${dignitary.first_arrival_session?.name ? ` at ${dignitary.first_arrival_session.name}` : ''}`, dignitary.first_arrival_at, { rosterId: getRosterId(dignitary) });
  });

  assignments.forEach((assignment) => {
    const user = assignment.user_profile || userById.get(assignment.user_id);
    addEvent(
      'assignment',
      'Protocol assignment updated',
      `${user?.full_name || 'Protocol officer'}${assignment.conference_role ? ` assigned as ${assignment.conference_role}` : ' assignment changed'}`,
      assignment.updated_at || assignment.created_at,
      { userId: assignment.user_id },
    );
  });

  allSessionDignitaries.forEach((dignitary) => {
    const seat = dignitary.section && dignitary.row_num && dignitary.col_num
      ? ` - ${dignitary.section} R${dignitary.row_num}/S${dignitary.col_num}`
      : '';
    addEvent(
      'status',
      `${statusLabels[dignitary.status] || 'Status'} update`,
      `${dignitary.name}${seat}`,
      dignitary.updated_at || dignitary.created_at,
      { rosterId: dignitary.conference_dignitary_id, sessionId: dignitary.session_id, status: dignitary.status },
    );
  });

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 80);
}

function buildDignitaryTracker({ roster, maps }) {
  const { assignmentByRosterId, latestByRosterId, rowsByRosterId } = maps;
  return roster.map((dignitary) => {
    const rosterId = getRosterId(dignitary);
    const assignment = assignmentByRosterId.get(rosterId);
    const latest = latestByRosterId.get(rosterId);
    const rows = rowsByRosterId.get(rosterId) || [];
    const hasArrived = Boolean(dignitary.first_arrival_at) || rows.some((row) => row.status === 'arrived' || row.status === 'seated');
    const hasSeated = rows.some((row) => row.status === 'seated');
    const status = hasSeated ? 'seated' : latest?.status || (hasArrived ? 'arrived' : 'pending');

    const trackerRow = {
      ...dignitary,
      rosterId,
      assignment,
      status,
      sessionRows: rows,
      latestSessionRow: latest,
      searchText: getDignitarySearchText(dignitary),
    };
    return trackerRow;
  }).sort((a, b) => compact(a.name).localeCompare(compact(b.name)));
}

export function buildControlCenterModel({
  conference = null,
  sessions = [],
  roster = [],
  assignments = [],
  users = [],
  sessionDignitariesBySessionId = {},
}) {
  const allSessionDignitaries = Object.values(sessionDignitariesBySessionId).flat();
  const maps = buildMaps({ roster, assignments, users, allSessionDignitaries });
  const diagnostics = buildSeatDiagnostics({
    sessions,
    sessionDignitariesBySessionId,
    auditorium: conference?.auditorium,
  });
  const statusCounts = getStatusCounts(roster, maps.latestByRosterId, maps.rowsByRosterId);
  const assignedProtocolCount = roster.filter((dignitary) => (
    dignitary.assigned_protocol_user_id || maps.assignmentByRosterId.has(getRosterId(dignitary))
  )).length;
  const inSessionCount = allSessionDignitaries.length;
  const assignedSeatCount = allSessionDignitaries.filter((dignitary) => dignitary.section && dignitary.row_num && dignitary.col_num).length;

  const summary = {
    ...statusCounts,
    sessions: sessions.length,
    inSession: inSessionCount,
    assignedSeats: assignedSeatCount,
    unassignedSeats: Math.max(0, inSessionCount - assignedSeatCount),
    assignmentCoverage: roster.length ? Math.round((assignedProtocolCount / roster.length) * 100) : 0,
    assignedProtocolCount,
    seatingCompletion: inSessionCount ? Math.round((assignedSeatCount / inSessionCount) * 100) : 0,
  };

  return {
    summary,
    alerts: buildAlerts({ conference, sessions, roster, assignments, users, maps, diagnostics }),
    feed: buildFeed({ conference, sessions, roster, assignments, users, allSessionDignitaries }),
    protocolRows: buildProtocolRows({ users, assignments, roster, maps }),
    sessionRows: diagnostics.sessionRows,
    trackerRows: buildDignitaryTracker({ roster, maps }),
  };
}
