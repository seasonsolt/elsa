/* Level data (PLAN A0 / S0-3, B1). Plain global const, no module syntax: inlined in a <script> and loadable in node.
   Built together with logic.js and companion.js in filename order (companion, levels, logic); nothing in here
   may touch another file's top-level bindings while loading, only inside functions.

   Room order (src/CONTRACT.md section 8): hall lake slope tower spring bunny floe music ballroom garden. The game ends after `garden`.

   Map: 13 rows x 24 columns, one character per tile.
     .  empty                                 #  wall
     =  one-way platform (drop with Down)     ~  water (splash, back to the bank)
     X  pink ice wall (Nuan melts it)         I  frozen water (Frost freezes ~)
     B  ice block (made by Frost, max 3)      G  iron gate (open while a plate is held)
     P  pressure plate                        *  snowflake (Frost collects)
     h  heart (Nuan collects)                 o  snowball
     +  small star (decorative, either sister, never needed for the door)
     D  door    S  snowman spot (goal)        E / A  Frost / Nuan spawn
   The six toys of PLAN B1 (numbers in TOYS, logic.js):
     /  \  ramps: `\` is high on the left and slides down to the right, `/` the other way. Ramps are surfaces, not solid: the foot of a run
            that drops one row per tile is a flat floor one row lower, the floor beside the top is in the ramp's row. Fill the tiles
            under a ramp with # (a sister cannot walk under a ramp, its high face is a wall).
     J  spring mushroom (solid, lands -> bounce about six tiles; a ledge 5 tiles above its top is comfortable, the ceiling stops a head)
     R  lost bunny (a body standing on the tile below it)      N  bunny home (non-solid, in the row the bunnies stand in)
     M  moving ice floe, a run of M is one floe; it needs `~` directly below every M and is level with the bank when the M row is the
        row of the bank's solid tiles (bank tiles in rows 11-12, water in row 12, stand row 10)
     1 2 3 4 5  note steps (do re mi fa so; red orange yellow green blue), solid; the room's `melody` says which, in which order
     F  ice flower (non-solid, blooms when touched)

   Level object:
     id        stable key ('hall'); new code indexes by id, not by position
     name      { en, zh }
     words     the 3 core English words of the room (PLAN A5)
     goal      'door' | 'snowman' | 'garden' (no door: every flower F open clears the room)
     map       13 strings of 24 characters
     melody    [n, ...] notes 1..5 to step on in this order (the music room); the door opens when it is played
     guide     [{ c, r, say }] targets in the order a stuck player should be led to them (items, then the door);
               `say` is the line key of the spoken prompt (guide_<id>_<n>, src/CONTRACT.md section 3). logic.js g.guide() walks this list:
               an entry is done when the item on that tile is collected, or a sister reaches that tile (the door: once it is open);
               a lost bunny on (c, r) (or `bunny: id`): once it follows; `note: k` (k-th note of the melody): once the melody is past it;
               a flower: once it has bloomed; a nest N: once every bunny is home
     assists   hints for the companion AI (PLAN A1, companion.js), [] when the room needs none:
                 { when: { near: [c, r], r: 3, gateClosed?: true }, who: 'frost' | 'nuan' | 'any', do: 'freeze' | 'melt' | 'block',
                   from: [c, r], dir: 1 | -1 }       the companion blinks to tile `from` (feet row r), faces `dir`, uses her magic
                 { when: { gateClosed: true, near: [c, r] }, who: 'any', do: 'standOnPlate' }
               `near` = the player is within `r` tiles (default 3) of that tile. Each assist fires once per room visit.
               (The S3 rooms need none: the generic helps and the toy rules in companion.js are enough.)
     memory    [c, r] of the hidden memory fragment, or undefined
     music     key of the THEMES entry in view/40-audio.js
   Presentation data that used to live in parallel arrays of the view script:
     memoryId  id of the matching entry in LINES.memory (content/lines.json); the memory fragment itself is picked up by logic.js
     bg        background image name         glows  [[x, y, radius, 'warm' | 'cool']] painted lights in that background (the S3 rooms: [])
   The view finds room-start, door-open, chapter and clear lines by naming convention (src/CONTRACT.md section 3), not through this file.
   Small decorative stars are '+' tiles in the map (3-5 per room), they are not a field.

   Kid rules the rooms follow (PLAN B1): one new toy per room, taught, used, then a small twist; every climb of the main route is a
   single jump (one-way steps), nothing needs a double jump; falling into water only sends you back to the bank.
*/
const LEVELS = [
  {
    id: 'hall',
    name: { en: 'The Ice Hall', zh: '冰堡大厅' },
    words: ['heart', 'star', 'door'],
    goal: 'door',
    map: [
      '########################',
      '#................#.....#',
      '#................#.....#',
      '#................#.....#',
      '#.........h......#.....#',
      '#..........+.....#.....#',
      '#.......====.....#.....#',
      '#...........==...#.....#',
      '#.+.......*...+..#+....#',
      '#......#####.....X.....#',
      '#....==#####.....X.....#',
      '#EA.h..#####.*...X..D..#',
      '########################',
    ],
    guide: [
      { c: 4, r: 11, say: 'guide_hall_1' },
      { c: 10, r: 8, say: 'guide_hall_2' },
      { c: 10, r: 4, say: 'guide_hall_3' },
      { c: 13, r: 11, say: 'guide_hall_4' },
      { c: 20, r: 11, say: 'guide_hall_5' },
    ],
    assists: [],
    memory: [8, 5],
    music: 0,
    memoryId: 'm1',
    bg: 'bg0',
    glows: [[482, 418, 120, 'warm'], [482, 60, 130, 'warm'], [299, 192, 46, 'warm'], [664, 192, 46, 'warm'], [53, 250, 44, 'warm'], [907, 250, 44, 'warm']],
  },
  {
    id: 'lake',
    name: { en: 'The Ice Lake Hall', zh: '冰湖长廊' },
    words: ['water', 'ice', 'fish'],
    goal: 'door',
    map: [
      '########################',
      '#..................#...#',
      '#..................#...#',
      '#..h.+.......*.....#...#',
      '#=====.......====..#...#',
      '#.....==...==......#...#',
      '#..........+.......#...#',
      '#.......========...#...#',
      '#.................+#...#',
      '#...*===..+........X...#',
      '#EA................X.D.#',
      '######~~~~~~~~~~~#######',
      '########################',
    ],
    guide: [
      { c: 4, r: 9, say: 'guide_lake_1' },
      { c: 3, r: 3, say: 'guide_lake_2' },
      { c: 13, r: 3, say: 'guide_lake_3' },
      { c: 21, r: 10, say: 'guide_lake_4' },
    ],
    assists: [],
    memory: [1, 3],
    music: 1,
    memoryId: 'm3',
    bg: 'bg1',
    glows: [[109, 120, 62, 'warm'], [478, 110, 62, 'warm'], [852, 120, 62, 'warm'], [560, 175, 90, 'cool']],
  },
  {
    id: 'slope',
    name: { en: 'The Snow Slide', zh: '雪坡滑梯' },
    words: ['slide', 'fast', 'down'],
    goal: 'door',
    map: [
      '########################',
      '#......................#',
      '#........+..h...+......#',
      '#===================...#',
      '#.................===..#',
      '#.EA...................#',
      '#####\\+........===.*...#',
      '######\\....+...........#',
      '#######\\..........===..#',
      '##########\\..........+.#',
      '###########\\...===.....#',
      '############\\........D.#',
      '########################',
    ],
    guide: [
      { c: 9, r: 8, say: 'guide_slope_1' },
      { c: 13, r: 11, say: 'guide_slope_2' },
      { c: 19, r: 6, say: 'guide_slope_3' },
      { c: 12, r: 2, say: 'guide_slope_4' },
      { c: 21, r: 11, say: 'guide_slope_5' },
    ],
    assists: [],
    memory: [9, 6],
    music: 0,
    memoryId: 'm5',
    bg: 'bg_slope',
    glows: [],
  },
  {
    id: 'tower',
    name: { en: 'The Gate Tower', zh: '机关塔楼' },
    words: ['push', 'open', 'gate'],
    goal: 'door',
    map: [
      '########################',
      '#...........#......#...#',
      '#..h........#...h..#...#',
      '#======.....#..====#...#',
      '#........+..#==....#...#',
      '#.......===.#..+...#...#',
      '#....==.....#.===..#...#',
      '#..*........#....==#...#',
      '#====.......#..*..+#...#',
      '#...........G.===..X...#',
      '#...==+.....G==....X...#',
      '#EA.....P...G......X.D.#',
      '########################',
    ],
    guide: [
      { c: 3, r: 7, say: 'guide_tower_1' },
      { c: 3, r: 2, say: 'guide_tower_2' },
      { c: 8, r: 11, say: 'guide_tower_3' },
      { c: 15, r: 8, say: 'guide_tower_4' },
      { c: 16, r: 2, say: 'guide_tower_5' },
      { c: 21, r: 11, say: 'guide_tower_6' },
    ],
    assists: [],
    memory: [18, 2],
    music: 2,
    memoryId: 'm2',
    bg: 'bg2',
    glows: [[85, 300, 60, 'warm'], [650, 120, 52, 'warm'], [810, 250, 56, 'warm'], [260, 150, 80, 'cool']],
  },
  {
    id: 'spring',
    name: { en: 'The Bouncy Snow Beds', zh: '弹弹雪床' },
    words: ['jump', 'up', 'high'],
    goal: 'door',
    map: [
      '########################',
      '#..............h.......#',
      '#......................#',
      '#........=======.......#',
      '#*....+.+..+.........*.#',
      '#...........J..........#',
      '#==...=====####....====#',
      '#..........####........#',
      '#.+........####..+.....#',
      '#..........####........#',
      '#..........####........#',
      '#EA.J......####..J...D.#',
      '########################',
    ],
    guide: [
      { c: 4, r: 10, say: 'guide_spring_1' },
      { c: 1, r: 4, say: 'guide_spring_2' },
      { c: 12, r: 4, say: 'guide_spring_3' },
      { c: 15, r: 1, say: 'guide_spring_4' },
      { c: 17, r: 10, say: 'guide_spring_5' },
      { c: 21, r: 4, say: 'guide_spring_6' },
      { c: 21, r: 11, say: 'guide_spring_7' },
    ],
    assists: [],
    memory: [10, 3],
    music: 1,
    memoryId: 'm6',
    bg: 'bg_spring',
    glows: [],
  },
  {
    id: 'bunny',
    name: { en: 'The Snow Bunny Burrow', zh: '雪兔窝' },
    words: ['bunny', 'home', 'carrot'],
    goal: 'door',
    map: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#.h..................*.#',
      '#......................#',
      '#===+....+......+..+===#',
      '#......................#',
      '#..===....R.......==...#',
      '#EA....R..#.....R..N..D#',
      '############~~~#########',
    ],
    guide: [
      { c: 2, r: 6, say: 'guide_bunny_1' },
      { c: 7, r: 11, say: 'guide_bunny_2' },
      { c: 10, r: 10, say: 'guide_bunny_3' },
      { c: 16, r: 11, say: 'guide_bunny_4' },
      { c: 21, r: 6, say: 'guide_bunny_5' },
      { c: 19, r: 11, say: 'guide_bunny_6' },
      { c: 22, r: 11, say: 'guide_bunny_7' },
    ],
    assists: [],
    memory: [13, 9],
    music: 2,
    memoryId: 'm7',
    bg: 'bg_bunny',
    glows: [],
  },
  {
    id: 'floe',
    name: { en: 'The Floe River', zh: '浮冰河' },
    words: ['left', 'right', 'wait'],
    goal: 'door',
    map: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#.......+.......+......#',
      '#..+...............+...#',
      '#.......h.......*......#',
      '#EA..................D.#',
      '######...MM###MM...#####',
      '######~~~~~###~~~~~#####',
    ],
    guide: [
      { c: 5, r: 10, say: 'guide_floe_1' },
      { c: 8, r: 9, say: 'guide_floe_2' },
      { c: 12, r: 10, say: 'guide_floe_3' },
      { c: 16, r: 9, say: 'guide_floe_4' },
      { c: 19, r: 10, say: 'guide_floe_5' },
      { c: 21, r: 10, say: 'guide_floe_6' },
    ],
    assists: [],
    memory: [12, 9],
    music: 1,
    memoryId: 'm8',
    bg: 'bg_floe',
    glows: [],
  },
  {
    id: 'music',
    name: { en: 'The Music Stairs', zh: '音乐楼梯' },
    words: ['red', 'yellow', 'blue'],
    goal: 'door',
    melody: [1, 3, 5],
    map: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#...............+......#',
      '#..............4.......#',
      '#....+....+...====+....#',
      '#..3....1....5....2....#',
      '#.===..===..===..===...#',
      '#EA...................D#',
      '########################',
    ],
    guide: [
      { c: 8, r: 9, say: 'guide_music_1', note: 0 },
      { c: 3, r: 9, say: 'guide_music_2', note: 1 },
      { c: 13, r: 9, say: 'guide_music_3', note: 2 },
      { c: 22, r: 11, say: 'guide_music_4' },
    ],
    assists: [],
    memory: [16, 5],
    music: 3,
    memoryId: 'm9',
    bg: 'bg_music',
    glows: [],
  },
  {
    id: 'ballroom',
    name: { en: 'The Starlight Ballroom', zh: '星光舞厅' },
    words: ['snowman', 'ball', 'hat'],
    goal: 'snowman',
    map: [
      '########################',
      '#......................#',
      '#.o..................o.#',
      '#=====............=====#',
      '#......................#',
      '#.....==.+..o...==.....#',
      '#.......========.......#',
      '#.....==........==.....#',
      '#..h................*.+#',
      '#=====............=====#',
      '#.....==+......+==.....#',
      '#.........EA.S.........#',
      '#####~~~##########~~~###',
    ],
    guide: [
      { c: 3, r: 8, say: 'guide_ballroom_1' },
      { c: 2, r: 2, say: 'guide_ballroom_2' },
      { c: 12, r: 5, say: 'guide_ballroom_3' },
      { c: 21, r: 2, say: 'guide_ballroom_4' },
      { c: 20, r: 8, say: 'guide_ballroom_5' },
      { c: 13, r: 11, say: 'guide_ballroom_6' },
    ],
    assists: [],
    memory: [19, 2],
    music: 3,
    memoryId: 'm4',
    bg: 'bg3',
    glows: [[60, 240, 50, 'warm'], [900, 240, 50, 'warm'], [480, 40, 150, 'cool'], [250, 170, 70, 'warm'], [710, 170, 70, 'warm']],
  },
  {
    id: 'garden',
    name: { en: 'The Spring Garden', zh: '春天花园' },
    words: ['flower', 'warm', 'spring'],
    goal: 'garden',
    map: [
      '########################',
      '#......................#',
      '#......................#',
      '#...............F......#',
      '#..............====+...#',
      '#F...................F.#',
      '#==............+...====#',
      '#................F.....#',
      '#..==.+........====....#',
      '#.......+...F..........#',
      '#==........====........#',
      '#EA.F.......F........F.#',
      '#######~~~##############',
    ],
    guide: [
      { c: 1, r: 5, say: 'guide_garden_1' },
      { c: 4, r: 11, say: 'guide_garden_2' },
      { c: 12, r: 11, say: 'guide_garden_3' },
      { c: 12, r: 9, say: 'guide_garden_4' },
      { c: 17, r: 7, say: 'guide_garden_5' },
      { c: 21, r: 5, say: 'guide_garden_6' },
      { c: 16, r: 3, say: 'guide_garden_7' },
      { c: 21, r: 11, say: 'guide_garden_8' },
    ],
    assists: [],
    memory: [14, 9],
    music: 0,
    memoryId: 'm10',
    bg: 'bg_garden',
    glows: [],
  },
];
