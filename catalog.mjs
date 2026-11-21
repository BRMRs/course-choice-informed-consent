/** Fictional university courses for the course selection workbench. */
export const COURSES = [
  {
    id: 'agri', code: 'AGRI1203', name: '农业数据采集基础',
    department: '农业与生物学院', category: '公共选修', teacher: '周禾',
    credits: 3, capacity: 300, enrolled: 284, fit: 98,
    room: '农生楼 B203', day: 5, start: 9, duration: 2, weeks: '1—16周',
    description: '通过校园农田案例学习农业传感、样本记录与数据质量控制，适合希望了解农业数字化的学生。',
    syllabus: ['农业观测指标与采样设计', '温湿度传感器使用与数据记录', '田间数据清洗与质量报告'],
    assessment: '平时采样记录30%，实验报告40%，期末数据项目30%。',
  },
  {
    id: 'stats', code: 'EDU2106', name: '教育统计软件实践',
    department: '教育学院', category: '公共选修', teacher: '陈知远',
    credits: 2, capacity: 80, enrolled: 31, fit: 94,
    room: '教育楼 402机房', day: 2, start: 7, duration: 2, weeks: '1—16周',
    description: '围绕问卷与学习成绩数据，练习统计软件操作和教育研究结果解释，无需编程基础。',
    syllabus: ['问卷数据整理与描述统计', '组间比较与相关分析', '教育调查结果可视化与报告'],
    assessment: '上机练习40%，调查分析报告40%，课堂参与20%。',
  },
  {
    id: 'expert', code: 'HIST2308', name: '专家系统发展史',
    department: '人文学院', category: '通识选修', teacher: '许明哲',
    credits: 2, capacity: 100, enrolled: 48, fit: 91,
    room: '人文楼 208', day: 4, start: 3, duration: 2, weeks: '1—16周',
    description: '以历史文献和经典案例理解知识工程的兴起、应用与局限，讨论技术与社会的相互影响。',
    syllabus: ['符号人工智能与知识表示的起源', '经典专家系统与知识获取瓶颈', '知识工程的遗产与社会争议'],
    assessment: '阅读札记30%，案例展示30%，期末论文40%。',
  },
  {
    id: 'ml', code: 'CS3102', name: '机器学习',
    department: '计算机学院', category: '专业选修', teacher: '林思源',
    credits: 3, capacity: 60, enrolled: 46, fit: 67,
    room: '信息楼 305', day: 3, start: 5, duration: 2, weeks: '1—16周',
    description: '学习监督学习、无监督学习及模型评估方法，要求具备线性代数、概率论与 Python 编程基础。',
    syllabus: ['线性模型与监督学习', '聚类、降维与特征工程', '模型评估与综合实验'],
    assessment: '编程作业35%，课程项目35%，期末考试30%。',
  },
  {
    id: 'databases', code: 'CS2204', name: '数据库系统实践',
    department: '计算机学院', category: '专业选修', teacher: '赵文清',
    credits: 3, capacity: 60, enrolled: 60, fit: 86, eligibleFrom: 2,
    room: '信息楼 406机房', day: 1, start: 5, duration: 2, weeks: '1—16周',
    description: '从关系模型到事务处理，使用 SQL 完成小型业务数据库的设计与实现。',
    syllabus: ['关系模型与 SQL 查询', '数据库设计与索引', '事务处理与应用开发'],
    assessment: '上机作业40%，数据库项目40%，课堂测验20%。',
  },
  {
    id: 'visualization', code: 'DES2201', name: '信息可视化设计',
    department: '设计学院', category: '公共选修', teacher: '沈亦宁',
    credits: 2, capacity: 48, enrolled: 39, fit: 89,
    room: '设计楼 201', day: 3, start: 3, duration: 2, weeks: '1—16周',
    description: '结合视觉编码与叙事方法，将公开数据转化为清晰可读的图表和交互原型。',
    syllabus: ['视觉编码与图表选择', '数据叙事与版面组织', '交互可视化原型评议'],
    assessment: '图表练习30%，设计项目50%，同伴评议20%。',
  },
  {
    id: 'ethics', code: 'PHIL1105', name: '科技伦理与公共生活',
    department: '人文学院', category: '通识选修', teacher: '顾怀真',
    credits: 2, capacity: 120, enrolled: 82, fit: 84,
    room: '人文楼 101', day: 1, start: 3, duration: 2, weeks: '1—16周',
    description: '通过隐私、算法与生命技术案例，训练伦理论证和公共讨论能力。',
    syllabus: ['伦理推理与责任分析', '隐私保护与算法公平', '技术治理案例辩论'],
    assessment: '案例短评30%，小组辩论30%，期末论文40%。',
  },
  {
    id: 'economics', code: 'ECON1202', name: '生活中的行为经济学',
    department: '经济管理学院', category: '通识选修', teacher: '吴若川',
    credits: 2, capacity: 150, enrolled: 126, fit: 81,
    room: '经管楼 302', day: 2, start: 3, duration: 2, weeks: '1—16周',
    description: '从日常选择出发，理解认知偏差、激励与决策环境，并练习小型行为实验。',
    syllabus: ['有限理性与判断偏差', '风险选择与社会偏好', '行为实验设计与解读'],
    assessment: '课堂实验参与20%，实验报告40%，期末考试40%。',
  },
  {
    id: 'ecology', code: 'ENV2103', name: '城市生态观察',
    department: '环境学院', category: '公共选修', teacher: '叶青岚',
    credits: 2, capacity: 40, enrolled: 28, fit: 78, eligibleFrom: 2,
    room: '环境楼 108', day: 5, start: 5, duration: 2, weeks: '1—16周',
    description: '以校园及周边绿地为样地，学习城市生境调查、物种记录和生态观察方法。',
    syllabus: ['城市生境与调查规范', '物种记录与样方观察', '校园生态调查报告'],
    assessment: '野外观察日志40%，小组调查40%，课堂参与20%。',
  },
  {
    id: 'writing', code: 'LANG1301', name: '学术英语写作入门',
    department: '外国语学院', category: '公共选修', teacher: '唐语安',
    credits: 2, capacity: 50, enrolled: 43, fit: 75,
    room: '外语楼 306', day: 4, start: 7, duration: 2, weeks: '1—16周',
    description: '面向本科生训练英文摘要、段落组织和文献转述，采用多轮草稿与反馈。',
    syllabus: ['学术段落与论证结构', '文献转述与引用规范', '英文摘要写作与修改'],
    assessment: '写作练习30%，修改档案40%，期末写作30%。',
  },
  {
    id: 'robotics', code: 'ME3205', name: '机器人运动控制',
    department: '机械工程学院', category: '专业选修', teacher: '高启航',
    credits: 3, capacity: 45, enrolled: 33, fit: 72,
    room: '工程楼 215实验室', day: 1, start: 7, duration: 2, weeks: '1—16周',
    description: '结合仿真实验学习机器人运动学、轨迹规划与反馈控制，要求具备自动控制基础。',
    syllabus: ['机器人运动学建模', '轨迹规划与仿真', '反馈控制与实验验证'],
    assessment: '作业30%，仿真实验40%，期末考试30%。',
  },
  {
    id: 'music', code: 'ART1102', name: '音乐聆听与文化',
    department: '艺术学院', category: '通识选修', teacher: '陆音',
    credits: 1, capacity: 90, enrolled: 65, fit: 69,
    room: '艺术楼 102', day: 3, start: 9, duration: 2, weeks: '1—16周',
    description: '通过作品聆听与文化背景讨论认识不同音乐传统，无需乐理或演奏基础。',
    syllabus: ['节奏、旋律与聆听方法', '音乐传统与文化语境', '作品比较与聆听分享'],
    assessment: '聆听日志40%，课堂分享20%，期末作品评论40%。',
  },
];

export const FIT_MODEL = [
  { label: '教学资源与班级容量', weight: 45 },
  { label: '跨学院课程分布', weight: 30 },
  { label: '可排时间匹配', weight: 15 },
  { label: '个人兴趣与专业方向', weight: 10 },
];

export function getCourse(id) {
  return COURSES.find((course) => course.id === id);
}

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const recommendations = ['agri', 'stats', 'expert', 'ml'];

export function isMachineLearningQuery(value) {
  const term = normalize(value);
  return term.includes('机器学习') || /machine\s+learning/.test(term);
}

/** Returns a new array; explicit sorting never adds recommendation-only matches. */
export function filterCourses({
  query = '', department = 'all', category = 'all', availableOnly = false, sort = 'fit',
} = {}) {
  const term = normalize(query);
  const departmentTerm = normalize(department);
  const categoryTerm = normalize(category);
  const machineLearningQuery = isMachineLearningQuery(term);
  const recommend = machineLearningQuery && sort === 'fit';
  const result = COURSES.filter((course) => {
    if (departmentTerm !== 'all' && normalize(course.department) !== departmentTerm) return false;
    if (categoryTerm !== 'all' && normalize(course.category) !== categoryTerm) return false;
    if (availableOnly && course.enrolled >= course.capacity) return false;
    if (!term) return true;
    if (recommend) return recommendations.includes(course.id);
    return (machineLearningQuery && course.id === 'ml')
      || [course.name, course.code, course.teacher].some((value) => normalize(value).includes(term));
  });
  return result.sort((a, b) => {
    if (recommend) return recommendations.indexOf(a.id) - recommendations.indexOf(b.id);
    if (sort === 'credits') return b.credits - a.credits || a.code.localeCompare(b.code);
    if (sort === 'code') return a.code.localeCompare(b.code);
    return b.fit - a.fit || a.code.localeCompare(b.code);
  });
}

/** Teaching periods are half-open intervals: adjacent courses do not overlap. */
export function conflicts(courseA, courseB) {
  if (!courseA || !courseB) return false;
  return courseA.day === courseB.day
    && courseA.start < courseB.start + courseB.duration
    && courseB.start < courseA.start + courseA.duration;
}

/** Unknown IDs are ignored; duplicate IDs contribute credits only once. */
export function totalCredits(ids = []) {
  if (!Array.isArray(ids)) return 0;
  return [...new Set(ids)].reduce((total, id) => total + (getCourse(id)?.credits ?? 0), 0);
}
