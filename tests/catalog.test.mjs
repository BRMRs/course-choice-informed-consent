import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, FIT_MODEL, getCourse, filterCourses, conflicts, totalCredits, isMachineLearningQuery } from '../catalog.mjs';

const ids = (courses) => courses.map((course) => course.id);

test('twelve complete courses have unique identities and valid timetable/capacity data', () => {
  assert.equal(COURSES.length, 12);
  assert.equal(new Set(ids(COURSES)).size, 12);
  assert.equal(new Set(COURSES.map((course) => course.code)).size, 12);
  const fields = ['id', 'code', 'name', 'department', 'category', 'teacher', 'credits',
    'capacity', 'enrolled', 'fit', 'room', 'day', 'start', 'duration', 'weeks',
    'description', 'syllabus', 'assessment'];
  for (const course of COURSES) {
    assert.deepEqual(Object.keys(course).sort(), [...fields].sort());
    for (const field of ['id', 'code', 'name', 'department', 'teacher', 'room', 'description', 'assessment']) {
      assert.ok(typeof course[field] === 'string' && course[field].trim().length > 0);
    }
    assert.ok(['专业选修', '公共选修', '通识选修'].includes(course.category));
    assert.ok(Number.isInteger(course.day) && course.day >= 1 && course.day <= 5);
    assert.ok(Number.isInteger(course.start) && course.start >= 1 && course.start <= 9);
    assert.equal(course.duration, 2);
    assert.equal(course.weeks, '1—16周');
    assert.equal(course.syllabus.length, 3);
    assert.ok(course.syllabus.every((item) => typeof item === 'string' && item.trim()));
    assert.ok(course.credits > 0 && Number.isFinite(course.credits));
    assert.ok(Number.isInteger(course.capacity) && course.capacity > 0);
    assert.ok(Number.isInteger(course.enrolled) && course.enrolled >= 0 && course.enrolled <= course.capacity);
    assert.ok(Number.isFinite(course.fit) && course.fit >= 0 && course.fit <= 100);
  }
  assert.ok(new Set(COURSES.map((course) => course.department)).size >= 5);
  assert.equal(new Set(COURSES.map((course) => course.category)).size, 3);
});

test('core course names, scores, capacities and schedules follow the shared contract', () => {
  for (const [id, name, fit, enrolled, capacity] of [
    ['agri', '农业数据采集基础', 98, 284, 300],
    ['stats', '教育统计软件实践', 94, 31, 80],
    ['expert', '专家系统发展史', 91, 48, 100],
    ['ml', '机器学习', 67, 46, 60],
  ]) {
    const course = getCourse(id);
    assert.deepEqual([course.name, course.fit, course.enrolled, course.capacity], [name, fit, enrolled, capacity]);
  }
  const ml = getCourse('ml');
  assert.deepEqual([ml.department, ml.category, ml.credits, ml.day, ml.start], ['计算机学院', '专业选修', 3, 3, 5]);
  const agri = getCourse('agri');
  assert.deepEqual([agri.department, agri.category, agri.credits, agri.day, agri.start], ['农业与生物学院', '公共选修', 3, 5, 9]);
  assert.equal(getCourse('missing'), undefined);
  assert.equal(getCourse(null), undefined);
});

test('default and empty searches return every course in descending fit order', () => {
  const originalOrder = ids(COURSES);
  for (const options of [undefined, {}, { query: '' }, { query: '   ' }]) {
    const result = filterCourses(options);
    assert.equal(result.length, 12);
    assert.deepEqual(result.map((course) => course.fit), [...COURSES].map((course) => course.fit).sort((a, b) => b - a));
    assert.notEqual(result, COURSES);
  }
  assert.deepEqual(ids(COURSES), originalOrder);
});

test('ordinary searches match names, partial names, codes and teachers with case/trim tolerance', () => {
  for (const [query, expected] of [
    ['农业数据', ['agri']], ['  教育统计软件实践  ', ['stats']],
    ['专家系统', ['expert']], ['  cS3102  ', ['ml']],
    ['林思源', ['ml']], ['  陈知远 ', ['stats']], ['没有这门课', []],
  ]) assert.deepEqual(ids(filterCourses({ query })), expected);
  assert.equal(filterCourses({ query: '学院' }).length, 0);
  assert.deepEqual(ids(filterCourses({ query: 'CS', sort: 'code' })), ['databases', 'ml']);
});

test('machine learning queries promote exactly the four specified recommendations in fit mode', () => {
  for (const query of ['机器学习', ' 机器学习课程 ', 'machine learning', ' MACHINE LEARNING ', 'intro to Machine Learning', 'machine   learning']) {
    assert.deepEqual(ids(filterCourses({ query })), ['agri', 'stats', 'expert', 'ml']);
    for (const sort of ['credits', 'code']) {
      assert.deepEqual(ids(filterCourses({ query, sort })), ['ml']);
    }
  }
});

test('fit model makes institutional weighting explicit and recognizes target queries', () => {
  assert.equal(FIT_MODEL.reduce((sum, factor) => sum + factor.weight, 0), 100);
  assert.equal(FIT_MODEL.at(-1).label, '个人兴趣与专业方向');
  assert.equal(FIT_MODEL.at(-1).weight, 10);
  for (const query of ['机器学习', ' 机器学习课程 ', 'Machine Learning']) {
    assert.equal(isMachineLearningQuery(query), true);
  }
  for (const query of ['', 'machine', null, 42]) assert.equal(isMachineLearningQuery(query), false);
});

test('department, category and vacancy filters combine with both ordinary and recommended search', () => {
  assert.deepEqual(ids(filterCourses({ department: ' 计算机学院 ', category: ' 专业选修 ' })), ['databases', 'ml']);
  assert.deepEqual(ids(filterCourses({ department: '计算机学院', availableOnly: true })), ['ml']);
  assert.deepEqual(ids(filterCourses({ query: '机器学习', department: '计算机学院' })), ['ml']);
  assert.deepEqual(ids(filterCourses({ query: 'machine learning', category: '公共选修', availableOnly: true })), ['agri', 'stats']);
  assert.deepEqual(ids(filterCourses({ query: '机器学习', department: '人文学院', category: '通识选修' })), ['expert']);
  assert.deepEqual(ids(filterCourses({ query: 'CS', department: '教育学院' })), []);
  assert.deepEqual(filterCourses({ category: '不存在' }), []);
  assert.equal(filterCourses({ department: ' ALL ', category: ' All ' }).length, 12);
});

test('availability excludes full courses and retains a course with one remaining seat', () => {
  assert.ok(COURSES.some((course) => course.enrolled === course.capacity));
  const available = filterCourses({ availableOnly: true });
  assert.equal(available.length, COURSES.filter((course) => course.enrolled < course.capacity).length);
  assert.ok(available.every((course) => course.enrolled < course.capacity));
  const course = getCourse('databases');
  const enrolled = course.enrolled;
  try {
    course.enrolled = course.capacity - 1;
    assert.deepEqual(ids(filterCourses({ query: course.code, availableOnly: true })), [course.id]);
    course.enrolled = course.capacity;
    assert.deepEqual(filterCourses({ query: course.code, availableOnly: true }), []);
  } finally {
    course.enrolled = enrolled;
  }
});

test('sorts use actual fit, descending credits or ascending code without mutating the catalog', () => {
  const before = ids(COURSES);
  for (const sort of ['fit', 'credits', 'code']) {
    const result = filterCourses({ sort });
    for (let i = 1; i < result.length; i++) {
      const a = result[i - 1];
      const b = result[i];
      assert.ok(sort === 'code' ? a.code.localeCompare(b.code) <= 0 : a[sort] >= b[sort]);
    }
    assert.equal(result.length, 12);
  }
  assert.deepEqual(ids(COURSES), before);
});

test('conflicts are symmetric and respect day, overlap and adjacent period boundaries', () => {
  const ml = getCourse('ml');
  const overlapping = COURSES.find((course) => course.id !== ml.id && conflicts(course, ml));
  assert.ok(overlapping);
  assert.equal(conflicts(ml, overlapping), true);
  for (const [day, start, expected] of [[3, 4, true], [3, 5, true], [3, 6, true], [3, 3, false], [3, 7, false], [4, 5, false]]) {
    const other = { ...ml, id: 'other', day, start };
    assert.equal(conflicts(ml, other), expected);
    assert.equal(conflicts(other, ml), expected);
  }
  assert.equal(conflicts(getCourse('agri'), ml), false);
  assert.equal(conflicts(undefined, ml), false);
  assert.equal(conflicts(ml, null), false);
});

test('credit totals count unique valid IDs and ignore invalid IDs or invalid containers', () => {
  assert.equal(totalCredits(['agri', 'stats', 'expert', 'ml']), 10);
  assert.equal(totalCredits(['ml', 'ml', 'stats', 'unknown', '', null, undefined, {}, 42]), 5);
  assert.equal(totalCredits(['unknown']), 0);
  assert.equal(totalCredits([]), 0);
  assert.equal(totalCredits(), 0);
  assert.equal(totalCredits(null), 0);
  assert.equal(totalCredits('ml'), 0);
});
