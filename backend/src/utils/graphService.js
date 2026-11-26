import { getDb } from '../config/db.js';
import { getOrSetCache, invalidateCachePrefix } from '../config/cache.js';
import { runCypher, checkNeo4jHealth } from '../config/neo4j.js';
import { getApprovedCatalogIndex } from './paperHelpers.js';

const TOPIC_RULES = [
  { slug: 'algorithms', label: 'Algorithms & Complexity', re: /\b(algorithm|daa|complexity|graph|tree|sorting)\b/i },
  { slug: 'data-structures', label: 'Data Structures', re: /\b(data structure|dsa|linked list|stack|queue)\b/i },
  { slug: 'programming', label: 'Programming', re: /\b(programming|python|java|c\+\+|oop|software)\b/i },
  { slug: 'databases', label: 'Databases & SQL', re: /\b(database|dbms|sql|nosql|relational)\b/i },
  { slug: 'operating-systems', label: 'Operating Systems', re: /\b(operating system|os|kernel|process|memory)\b/i },
  { slug: 'networks', label: 'Computer Networks', re: /\b(network|cn|tcp|protocol|security|cyber)\b/i },
  { slug: 'ai-ml', label: 'AI & Machine Learning', re: /\b(artificial intelligence|machine learning|deep learning|neural|nlp|reinforcement|rl|ai)\b/i },
  { slug: 'mathematics', label: 'Mathematics', re: /\b(calculus|linear algebra|discrete|mathematics|math|probability|differential|number theory)\b/i },
  { slug: 'statistics', label: 'Statistics & Analytics', re: /\b(statistic|analytics|regression|chi|econometric|forecasting|data)\b/i },
  { slug: 'finance', label: 'Finance & Accounting', re: /\b(financ|accounting|risk|valuation|corporate|tax|banking|investment)\b/i },
  { slug: 'marketing', label: 'Marketing & Strategy', re: /\b(marketing|brand|consumer|sales|strategy|entrepreneur)\b/i },
  { slug: 'management', label: 'Management & Org', re: /\b(management|organization|leadership|hr|operations|supply chain|law|ethics)\b/i },
  { slug: 'electronics', label: 'Electronics & Circuits', re: /\b(electronic|circuit|digital|signal|vlsi|embedded|microprocessor|iot)\b/i },
  { slug: 'design', label: 'Design & Studio', re: /\b(design|ui|ux|typography|studio|visual|product|sketch)\b/i },
];

export function extractTopics(text) {
  const input = String(text || '');
  const matched = [];
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(input)) {
      matched.push({ slug: rule.slug, label: rule.label });
    }
  }
  return matched;
}

function parseCourseCodeParts(code) {
  const m = String(code || '').trim().toUpperCase().match(/^([A-Z]{2,4})(\d{3,4})$/);
  if (!m) return null;
  return { prefix: m[1], num: Number(m[2]) };
}

function computeNextLevelEdges(courses) {
  const byPrefix = new Map();
  for (const c of courses) {
    const parts = parseCourseCodeParts(c.code);
    if (!parts) continue;
    if (!byPrefix.has(parts.prefix)) byPrefix.set(parts.prefix, []);
    byPrefix.get(parts.prefix).push({ code: String(c.code).toUpperCase(), num: parts.num });
  }
  const edges = [];
  for (const list of byPrefix.values()) {
    list.sort((a, b) => a.num - b.num);
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i + 1].num > list[i].num) {
        edges.push({ from: list[i].code, to: list[i + 1].code });
      }
    }
  }
  return edges;
}

export async function syncCatalogToNeo4j() {
  const health = await checkNeo4jHealth();
  if (!health.connected) {
    throw new Error('Neo4j AuraDB is not reachable. Check NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD.');
  }

  const db = await getDb();
  const [coursesRes, papers] = await Promise.all([
    db.query('SELECT id, code, name FROM courses ORDER BY id ASC'),
    getApprovedCatalogIndex(),
  ]);

  // Infer department & paper titles per course from approved papers
  const deptByCourse = new Map();
  const titlesByCourse = new Map();
  for (const p of papers) {
    const code = String(p.course_code || '').toUpperCase();
    if (!code) continue;
    if (!deptByCourse.has(code) && p.department) {
      deptByCourse.set(code, String(p.department).toUpperCase());
    }
    if (!titlesByCourse.has(code)) titlesByCourse.set(code, []);
    titlesByCourse.get(code).push(p.title || p.course_name || '');
  }

  const courseRows = coursesRes.rows.map((c) => {
    const code = String(c.code || '').toUpperCase();
    const dept = deptByCourse.get(code) || 'B.TECH';
    const combinedText = `${c.name || ''} ${code} ${(titlesByCourse.get(code) || []).slice(0, 5).join(' ')}`;
    const topics = extractTopics(combinedText);
    return {
      id: Number(c.id),
      code,
      name: String(c.name || code),
      department: dept,
      topics,
    };
  });

  const paperRows = papers.map((p) => ({
    id: Number(p.id),
    course_code: String(p.course_code || 'GEN').toUpperCase(),
    title: String(p.title || p.file_name || `Paper ${p.id}`),
    paper_type: String(p.paper_type || 'endterm').toUpperCase(),
    year: Number(p.year || 2024),
    semester: String(p.semester || '1'),
    department: String(p.department || 'B.TECH').toUpperCase(),
  }));

  const nextEdges = computeNextLevelEdges(courseRows);

  // Create constraints/indexes idempotently
  await runCypher('CREATE CONSTRAINT course_code_unique IF NOT EXISTS FOR (c:Course) REQUIRE c.code IS UNIQUE', {}, 5000);
  await runCypher('CREATE CONSTRAINT paper_id_unique IF NOT EXISTS FOR (p:Paper) REQUIRE p.id IS UNIQUE', {}, 5000);
  await runCypher('CREATE CONSTRAINT topic_slug_unique IF NOT EXISTS FOR (t:Topic) REQUIRE t.slug IS UNIQUE', {}, 5000);
  await runCypher('CREATE CONSTRAINT prog_code_unique IF NOT EXISTS FOR (g:Programme) REQUIRE g.code IS UNIQUE', {}, 5000);

  // Batch merge courses + programmes + topics
  await runCypher(
    `UNWIND $courses AS row
     MERGE (c:Course { code: row.code })
     SET c.id = row.id, c.name = row.name, c.department = row.department
     MERGE (g:Programme { code: row.department })
     MERGE (c)-[:IN_PROGRAMME]->(g)
     FOREACH (t IN row.topics |
       MERGE (tp:Topic { slug: t.slug })
       SET tp.label = t.label
       MERGE (c)-[:COVERS_TOPIC]->(tp)
     )`,
    { courses: courseRows },
    15000
  );

  // Batch merge approved papers
  await runCypher(
    `UNWIND $papers AS row
     MERGE (p:Paper { id: row.id })
     SET p.title = row.title,
         p.paper_type = row.paper_type,
         p.year = row.year,
         p.semester = row.semester,
         p.department = row.department
     MERGE (c:Course { code: row.course_code })
     MERGE (p)-[:BELONGS_TO]->(c)`,
    { papers: paperRows },
    15000
  );

  // Batch merge NEXT_LEVEL progression edges
  if (nextEdges.length > 0) {
    await runCypher(
      `UNWIND $edges AS edge
       MATCH (a:Course { code: edge.from }), (b:Course { code: edge.to })
       MERGE (a)-[:NEXT_LEVEL]->(b)`,
      { edges: nextEdges },
      10000
    );
  }

  invalidateCachePrefix('graph:');
  return {
    synced_courses: courseRows.length,
    synced_papers: paperRows.length,
    progression_edges: nextEdges.length,
  };
}

export async function getRelatedForCourse(rawCourseCode) {
  const courseCode = String(rawCourseCode || '').trim().toUpperCase();
  if (!courseCode) return { source: 'none', course_code: '', topics: [], related_courses: [] };

  return getOrSetCache(`graph:related:${courseCode}`, 10 * 60 * 1000, async () => {
    // 1. Try Neo4j Cypher first (1-2 hop topic + progression recommendations)
    const records = await runCypher(
      `MATCH (c:Course { code: $code })
       OPTIONAL MATCH (c)-[:COVERS_TOPIC]->(t:Topic)
       WITH c, collect(DISTINCT { slug: t.slug, label: t.label }) AS myTopics
       OPTIONAL MATCH (c)-[r:COVERS_TOPIC|NEXT_LEVEL]-(other)
       OPTIONAL MATCH (otherCourse:Course)-[:COVERS_TOPIC]->(shared:Topic)<-[:COVERS_TOPIC]-(c)
       WHERE otherCourse.code <> c.code
       WITH c, myTopics,
            collect(DISTINCT CASE WHEN other:Course AND other.code <> c.code
              THEN { code: other.code, name: other.name, department: other.department, reason: 'Course Progression' }
              ELSE null END) AS progCourses,
            collect(DISTINCT CASE WHEN otherCourse IS NOT NULL
              THEN { code: otherCourse.code, name: otherCourse.name, department: otherCourse.department, reason: 'Shared Topic: ' + shared.label }
              ELSE null END) AS topicCourses
       RETURN myTopics, progCourses + topicCourses AS combined`,
      { code: courseCode }
    );

    if (records && records.length > 0) {
      const rec = records[0];
      const myTopics = (rec.get('myTopics') || []).filter((t) => t && t.slug);
      const rawRelated = (rec.get('combined') || []).filter(Boolean);
      const dedup = new Map();
      for (const item of rawRelated) {
        if (item?.code && !dedup.has(item.code)) {
          dedup.set(item.code, item);
        }
      }
      const relatedList = Array.from(dedup.values()).slice(0, 6);
      if (relatedList.length > 0 || myTopics.length > 0) {
        return {
          source: 'neo4j',
          course_code: courseCode,
          topics: myTopics,
          related_courses: relatedList,
        };
      }
    }

    // 2. Fail-open In-Memory Graph Fallback from cached Neon catalog
    const allPapers = await getApprovedCatalogIndex();
    const courseMap = new Map();
    for (const p of allPapers) {
      const code = String(p.course_code || '').toUpperCase();
      if (!code) continue;
      if (!courseMap.has(code)) {
        courseMap.set(code, {
          code,
          name: p.course_name || p.title || code,
          department: p.department || 'B.TECH',
          topics: extractTopics(`${p.course_name || ''} ${p.title || ''} ${code}`),
        });
      }
    }

    const current = courseMap.get(courseCode);
    if (!current) {
      return { source: 'fallback', course_code: courseCode, topics: [], related_courses: [] };
    }

    const myTopicSlugs = new Set(current.topics.map((t) => t.slug));
    const currentParts = parseCourseCodeParts(courseCode);
    const scored = [];

    for (const candidate of courseMap.values()) {
      if (candidate.code === courseCode) continue;
      let score = 0;
      let reason = '';

      const candParts = parseCourseCodeParts(candidate.code);
      if (currentParts && candParts && currentParts.prefix === candParts.prefix) {
        score += 3;
        reason = `${currentParts.prefix} Track`;
      }

      const shared = candidate.topics.filter((t) => myTopicSlugs.has(t.slug));
      if (shared.length > 0) {
        score += shared.length * 4;
        reason = `Topic: ${shared[0].label}`;
      }

      if (score === 0 && candidate.department === current.department) {
        score = 1;
        reason = `${current.department} Archive`;
      }

      if (score > 0) {
        scored.push({
          code: candidate.code,
          name: candidate.name,
          department: candidate.department,
          reason,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      source: 'fallback',
      course_code: courseCode,
      topics: current.topics,
      related_courses: scored.slice(0, 6).map(({ score: _s, ...rest }) => rest),
    };
  });
}

export async function getGraphStats() {
  const health = await checkNeo4jHealth();
  if (!health.connected) {
    return { ...health, nodes: 0, relationships: 0 };
  }
  const records = await runCypher(
    'MATCH (n) WITH count(n) AS nodes OPTIONAL MATCH ()-[r]->() RETURN nodes, count(r) AS rels',
    {},
    5000
  );
  if (!records || records.length === 0) {
    return { ...health, nodes: 0, relationships: 0 };
  }
  return {
    ...health,
    nodes: Number(records[0].get('nodes')?.toNumber?.() ?? records[0].get('nodes') ?? 0),
    relationships: Number(records[0].get('rels')?.toNumber?.() ?? records[0].get('rels') ?? 0),
  };
}
