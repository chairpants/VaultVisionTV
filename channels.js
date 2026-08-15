// The channel lineup. Organized by *originating network* first, then by genre
// and theme -- channels 4-21 are the networks a show first aired on (ABC, CBS,
// NBC, Fox, Nickelodeon, first-run syndication), which is an axis nothing in
// the old lineup used. Everything below that is the older genre/theme tier,
// kept where it still has an identity of its own.
//
// Three kinds of channel:
//
//   kind: "genre"   — content pool is *every* show in the catalog tagged
//                      with `genre`, derived at runtime from catalog.json.
//                      Zero manual curation; scales automatically as
//                      VaultVision's library grows and tools/build-catalog.py
//                      is re-run.
//   kind: "curated" — a hand-picked pool, optionally gated to specific
//                      days/hours via `daypart`. Outside any daypart window
//                      (or for channels with no daypart at all — always-on
//                      "networks"), `fallbackPool` plays instead — real
//                      affiliates don't go dark between their special
//                      blocks, they run filler.
//   kind: "vod"     — not a scheduled simulation at all: a browsable menu
//                      (see vod.js) driven live off the catalog, sectioned
//                      by genre same as the "genre" channels above.
//
// `daypart[].days` is 0=Sunday..6=Saturday (Date#getDay()). Windows must not
// overlap for a single channel; the scheduler takes the first match. A window
// that crosses midnight is written as two windows (23–24 and 0–5), since
// matchingWindow compares against getHours(). `daypart[].ordered` keeps a pool
// in catalog order instead of shuffling it — for serials that only make sense
// front-to-back. `tagline` is pure flavor, shown under the channel name in the
// OSD banner.
//
// A show deliberately appears on more than one channel: this is a rerun
// simulator, and the same series legitimately belonged to a network, a decade,
// and a genre at once. What it must never do is appear twice inside one pool —
// tools/check-channels.js fails on that.
//
// The block recordings (TGIF, SNICK, NickAtNite, FoxKids, SatMorning,
// MonsterVision, SciFiAnime, MtvTrl) are no longer channels of their own.
// They're dayparts on the network that aired them, which is what they
// always were.
//
// KIDS & LEARNING sits on channel 3 — the lowest tunable slot, so it's the
// front door when tuning up from the bottom. The guide keeps channel 1 (real
// cable lineups commonly skip it too) and VIDEO ON DEMAND channel 2, which
// also makes VOD the topmost row in the guide's own listings.
//
// Plain script, not a module (see scheduler.js's header for why) — loaded via
// <script src="channels.js">, so file:// pages can load it too.
const GUIDE_CHANNEL = 1;
const VOD_CHANNEL = 2;
// Every genre VaultVision files a feature film under -- the whole library of
// the VBO tier at the bottom of this file. Anything not in here is a TV
// series, which is also how VOD splits its top level (vod.js).
const MOVIE_GENRES = [
  "Action & Adventure", "Comedy", "Drama", "Family & Kids", "Holiday",
  "Horror", "Sci-Fi & Fantasy",
];
window.MOVIE_GENRES = MOVIE_GENRES;
window.GUIDE_CHANNEL = GUIDE_CHANNEL;
window.VOD_CHANNEL = VOD_CHANNEL;

window.CHANNELS = [
  { number: GUIDE_CHANNEL, name: "TV GUIDE", kind: "guide", tagline: "What's on, eventually." },
  { number: VOD_CHANNEL, name: "🎬 VIDEO ON DEMAND", kind: "vod", tagline: "Now playing." },
  {
    number: 3, name: "KIDS & LEARNING", kind: "curated",
    tagline: "Homework help, sort of.",
    daypart: [],
    fallbackPool: [
      "BillNye", "AdventuresinWonderland", "GummiBears",
      "BerenstainBears", "Ghostwriter", "SchoolhouseRock", "LittleBear",
      "CliffordtheBigRedDogSeriesSeries", "Zoboomafoo",
      "BertandErniesGreatAdventures", "RoundtheTwist", "AllegrasWindow",
      "Wishbone", "MouseFactory", "MrMen", "JimHensonHour",
      "CosmosaPersonalVoyage", "PlanetEarth",
      "WonderPetsEpisodeswithMissingEpisodes",
      "MartyStouffersWildAmerica", "WhereInTheWorldIsCarmenSandiego",
    ],
  },
  {
    number: 4, name: "ABC PRIMETIME", kind: "curated",
    tagline: "Thank goodness it's Friday.",
    // TGIF is the Friday block it always was -- the tape itself plus the four
    // shows that ran in it. Every other night is the rest of ABC's comedy.
    daypart: [
      { days: [5], startHour: 20, endHour: 22, pool: [
        "TGIF", "FamilyMatters", "GrowingPains", "JusttheTenofUs",
        "StepByStep",
      ] },
    ],
    fallbackPool: [
      "DrewCareyShow", "HomeImprovement", "Coach", "Taxi1978",
      "McHalesNavySeries", "DharmaAndGreg", "JeffFoxworthyShow",
      "BosomBuddies", "SoulMan", "TeenAngel",
      "CavemenSeriesSlightlyBetterQuality", "YouWish",
    ],
  },
  {
    number: 5, name: "ABC DRAMA", kind: "curated",
    tagline: "Alphabet network, after dark.",
    // Dark Shadows is 1,239 continuous chapters -- useless to drop into at
    // random, so it gets the overnight to itself and plays `ordered`, front to
    // back, looping at the finale (see buildPool in scheduler.js).
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 5, ordered: true, pool: [
        "DarkShadowsTheSeries",
      ] },
    ],
    fallbackPool: [
      "NYPDBlue", "WonderYears", "DoogieHowserMD", "LifeGoesOn",
      "TwinPeaks", "BattlestarGalactica", "Rookies", "MaxHeadroom",
      "BarbaryCoast", "LifeAsWeKnowIt", "Automan", "666ParkAvenueSeries",
      "CopRock", "BlueThunder",
    ],
  },
  {
    number: 6, name: "CBS CLASSICS", kind: "curated",
    tagline: "The eye has a long memory.",
    daypart: [],
    fallbackPool: [
      "MASH", "Jeffersons", "LeaveIttoBeavertheSeries",
      "PetticoatJunction", "Newhart", "GreenAcres", "MaryTylerMooreShow",
      "DickVanDyke", "TheLucyShow", "HeresLucy", "MisterEd",
      "ArchieBunkersPlace", "WkrpinCincinnati", "AllInTheFamily",
    ],
  },
  {
    number: 7, name: "CBS PRIMETIME", kind: "curated",
    tagline: "Tiffany network, prime hours.",
    daypart: [],
    fallbackPool: [
      "MurphyBrown", "EverybodyLovesRaymond", "KingofQueens",
      "Nanny", "StillStanding", "BlessThisHouse",
    ],
  },
  {
    number: 8, name: "CBS DRAMA", kind: "curated",
    tagline: "An hour at a time.",
    daypart: [],
    fallbackPool: [
      "NorthernExposure", "DueSouth", "Jericho", "BrooklynSouth",
      "LogansRun", "DallastheSeries", "MurderSheWrote",
    ],
  },
  {
    number: 9, name: "NBC CLASSIC", kind: "curated",
    tagline: "Peacock, full plumage.",
    daypart: [],
    fallbackPool: [
      "SavedByTheBell", "CosbyShow", "FactsofLife", "NightCourt",
      "GetSmart", "MamasFamily", "TheHoganFamily", "ALFtheSeries",
      "PunkyBrewster", "TheMonkees", "EerieIndiana", "ItsYourMove",
    ],
  },
  {
    number: 10, name: "NBC MUST SEE", kind: "curated",
    tagline: "Thursday, all week long.",
    daypart: [],
    fallbackPool: [
      "MadAboutYou", "NewsRadio", "CarolineInTheCity", "VeronicasCloset",
      "Joey", "Wings", "WeberShow", "Tucker", "WillAndGrace",
    ],
  },
  {
    number: 11, name: "NBC ACTION", kind: "curated",
    tagline: "A plan comes together hourly.",
    daypart: [],
    fallbackPool: [
      "ATeam", "HighwayToHeaven", "KnightRider", "Baywatch",
      "BuckRogers", "V1983", "Chase", "QuantumLeap",
    ],
  },
  {
    number: 12, name: "FOX FUNNY", kind: "curated",
    tagline: "The fourth network laughs last.",
    daypart: [],
    fallbackPool: [
      "MADtv", "MalcolmInTheMiddle", "InLivingColor", "ParkerLewis",
      "NedAndStacey", "PJs", "MarriedWithChildren", "BernieMacShow",
      "Simpsons", "BacktoYou", "BakersfieldPD", "Action", "Mulaney",
      "BenStillerShow", "Woops", "Tick", "That70sShow",
    ],
  },
  {
    number: 13, name: "FOX DRAMA", kind: "curated",
    tagline: "Cancelled too soon, airing forever.",
    daypart: [],
    fallbackPool: [
      "PartyOfFive", "TheOC", "Millennium", "BriscoCountyJr",
      "LoneGunmen", "FireflySeries",
    ],
  },
  // -- literal recorded broadcast blocks, each its own channel
  // ----------------
  {
    number: 14, name: "FOX KIDS", kind: "curated",
    tagline: "Weekday afternoons, permanently.",
    // The block tape airs in its own slot; the toons that filled it run the rest
    // of the week.
    daypart: [
      { days: [6], startHour: 8, endHour: 12, pool: [
        "FoxKids", "PowerRangers", "BatmanTAS", "XMen", "SpiderManTAS",
      ] },
    ],
    fallbackPool: [
      "Digimon", "Animaniacs", "BobbysWorld", "TheTick", "Godzilla",
      "TMNTNextMutation", "Goosebumps",
    ],
  },
  {
    number: 15, name: "THE LEARNING CHANNEL", kind: "curated",
    tagline: "Edutainment, on a schedule.",
    daypart: [],
    fallbackPool: [
      "BillNye", "SchoolhouseRock", "CosmosaPersonalVoyage",
      "PlanetEarth", "MartyStouffersWildAmerica",
      "WhereInTheWorldIsCarmenSandiego",
    ],
  },
  {
    number: 16, name: "NICKELODEON", kind: "curated",
    tagline: "Slime not included.",
    // SNICK on Saturday night and Nick at Nite after 11, same as it aired.
    // The NickAtNite recordings themselves (2-6h each) only go in the 0-5
    // window, which is wide enough to actually hold one -- the 23-24 hour is
    // its own separately-tracked window (see channels.js's own header on
    // midnight-crossing windows), so a tape that ran past its end used to
    // hand off mid-episode to a window with no memory of where it left off.
    // 23-24 instead leads in with the classic sitcoms Nick at Nite actually
    // ran -- they live on ch 6/9 too, which is the point of a rerun channel.
    daypart: [
      { days: [6], startHour: 20, endHour: 22, pool: [
        "SNICK",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 23, endHour: 24, pool: [
        "LeaveIttoBeavertheSeries", "PetticoatJunction",
        "GreenAcres", "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow",
        "HeresLucy", "MisterEd", "GetSmart", "Taxi1978", "Newhart",
        "TheMonkees", "BosomBuddies",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 5, pool: [
        "NickAtNite", "LeaveIttoBeavertheSeries", "PetticoatJunction",
        "GreenAcres", "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow",
        "HeresLucy", "MisterEd", "GetSmart", "Taxi1978", "Newhart",
        "TheMonkees", "BosomBuddies",
      ] },
    ],
    fallbackPool: [
      "SpongeBobSquarePants", "FairlyOddParents", "GUTS",
      "AreYouAfraidOfTheDark", "AlexMack", "NickArcade", "HeyDude",
      "InvaderZIM", "KaBlam", "RenAndStimpy", "RockosModernLife",
      "SaluteYourShorts", "Animorphs",
    ],
  },
  // Elementary-tier cartoons, 1980-onward half of the split — SUNDAY FUNNIES
  // (36) takes everything pre-1980. The split used to be Saturday-vs-Sunday
  // with no content axis at all, which put Popeye and 1960s Hanna-Barbera in
  // the same rotation as Gravity Falls and SpongeBob; era is the axis now,
  // and the day each block airs is just flavor on top of it. The teen-action
  // titles this pool used to also carry (XMen, SpiderManTAS,
  // TeenageMutantNinjaTurtles, CaptainPlanet) moved to TEEN ACTION THEATER
  // (44). Was eight 1960s/70s classic sitcoms — i.e. this "cartoon channel"
  // was a 60s-sitcom channel 164 of every 168 hours, since a dayparted
  // channel plays its fallback every hour outside the window. Same era, same
  // tier, still cartoons: the rest of the 1980+ pool.
  {
    number: 17, name: "SATURDAY MORNING", kind: "curated",
    tagline: "Eat your cereal.",
    // The six SatMorning recordings run 107-365 minutes -- a whole morning each.
    // Gated to Saturday morning so they never interrupt the weekday rotation of
    // 22-minute cartoons.
    daypart: [
      { days: [6], startHour: 8, endHour: 12, pool: [
        "SatMorning",
      ] },
    ],
    fallbackPool: [
      "GarfieldandFriendsSeries", "RockyandBullwinkleShow", "Recess",
      "AlvinandtheChipmunks", "MuppetBabies", "Animaniacs",
      "Beetlejuice", "PeabodysImprobableHistory", "BobbysWorld",
      "TheMaskAnimatedSeries", "Histeria",
      "AceVenturaPetDetectiveSeries", "WackyRacesSeries",
      "MotormouseandAutocat", "CaptainN", "CampCandy",
      "SonictheHedgehog", "LandOfTheLost1991",
      "MightyMousetheNewAdventures", "CattanoogaCatstheSeries",
      "JosieandthePussycatsTVseries", "PolePosition", "GarbagePailKids",
      "KarateKid", "Houndcats", "CaliforniaDreams", "TheJetsons",
    ],
  },
  {
    number: 18, name: "CARTOON CARTOONS", kind: "curated",
    tagline: "Basic cable, drawn by hand.",
    daypart: [],
    fallbackPool: [
      "PowerpuffGirls", "CampLakebottom", "DuckDodgers",
      "DextersLaboratorytheSeries",
      "EdEddNEddySeriesAllEpisodesandSpecials", "CaspersScareSchool",
      "CouragetheCowardlyDog", "ArchiesWeirdMysteries", "GravityFalls",
      "LandBeforeTime", "MorphFiles", "SwanBoy",
    ],
  },
  {
    number: 19, name: "TOON AFTERNOON", kind: "curated",
    tagline: "Straight from the syndication truck.",
    daypart: [],
    fallbackPool: [
      "TeenageMutantNinjaTurtles", "CaptainPlanet", "TinyToonAdventures",
      "DarkwingDucktheSeries", "HeathcliffandtheCatillacCatsTVSeries",
      "InspectorGadget", "DuckTalesSeriesWorkinProgress", "MutantLeague",
      "AdventuresOfSonic", "BikerMiceFromMars", "RamboTheForceofFreedom",
      "EagleRiders", "BuzzLightyearofStarCommand",
      "BeastWarsTransformers", "LippytheLionandHardyHarHar",
      "WallyGator", "MightyMax", "PoliceAcademyTheAnimatedSeries",
      "StarcomtheUSSpaceForceSeries", "TheJetsons",
    ],
  },
  {
    number: 20, name: "SECTOR 7", kind: "curated",
    tagline: "Warp factor rerun.",
    // 11 anime-block tapes, ~2h each: one Saturday night gets 11 weeks of unique
    // programming, where two-a-night would burn through it in five.
    daypart: [
      { days: [6], startHour: 20, endHour: 24, pool: [
        "SciFiAnime",
      ] },
    ],
    fallbackPool: [
      "DoctorWho", "StarTrekTNG", "StarTrekDS9", "StarTrekVoyager",
      "GeneRoddenberrysAndromeda", "Xena", "Space1999", "TekWar",
      "RoboCopliveactionTVseries", "JackofAllTradesTVseries",
      "MortalKombatConquest", "HitchhikersGuidetotheGalaxy",
    ],
  },
  {
    number: 21, name: "ANTHOLOGY", kind: "curated",
    tagline: "A different story every week.",
    daypart: [],
    fallbackPool: [
      "AlfredHitchcockPresents", "TwilightZone1959",
      "AreYouAfraidOfTheDark", "NewAlfredHitchcockPresents",
      "AmazingStories", "NightGallery",
    ],
  },
  {
    number: 22, name: "ADVENTURE NETWORK", kind: "curated",
    tagline: "Car chases guaranteed.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "PartyOfFive", "WonderYears", "ATeam",
      "HighwayToHeaven", "NorthernExposure", "SwitchedatBirth",
      "DoogieHowserMD", "TheOC", "Everwood", "KnightRider", "Baywatch",
      "DueSouth", "CharmedtheSeries", "BuckRogers", "IntotheBadlands",
      "TwinPeaks", "Jericho", "BriscoCountyJr", "Animorphs",
      "BattlestarGalactica", "Persuaders", "Rookies", "V1983",
      "BrooklynSouth", "TheNetAmericanTVseries", "Chase", "LoneGunmen",
      "BarbaryCoast", "FireflySeries", "LogansRun", "MaxHeadroom",
      "Automan", "DallastheSeries", "HandmaidsTaleSeries",
      "LifeAsWeKnowIt", "Middleman", "BlueThunder", "CopRock", "Tick",
      "QuantumLeap", "BuffyTheVampireSlayer",
    ],
  },
  { number: 23, name: "ANIME ZONE", kind: "genre", genre: "Anime",
    tagline: "Dubbed, subbed, and everything between." },
  { number: 24, name: "LAUGH TRACK", kind: "genre", genre: "Sketch Comedy & Late Night",
    tagline: "Live from a soundstage somewhere." },
  // Channel 25 MOVIE VAULT is gone: it swept the "TV Movies" genre, which
  // VaultVision has since split into real film genres (Comedy, Drama, Horror,
  // Action & Adventure, Sci-Fi & Fantasy, Family & Kids, Holiday). Those are
  // the VBO tier at the bottom of this file now, and 25 stays empty rather
  // than renumbering every channel below it. The made-for-TV movies
  // themselves didn't go anywhere -- they're in Horror/Action now, and still
  // on CHILLER and CREATURE DOUBLE FEATURE.
  // Live PD used to be excluded here by id, because every file in the item
  // VaultVision sources it from needs an archive.org login (401 anonymously).
  // That was the wrong layer — it hid the show from this one channel while
  // vod.js, which reads the catalog directly, still offered all 37 dead
  // episodes. The unplayable item is now dropped in build-catalog.py's
  // DEAD_ITEMS, and the 13 episodes that do exist on open items come from
  // data/local-shows/LivePD, so this sweep picks them up with no opt-out
  // list.
  { number: 26, name: "REALITY CHECK", kind: "genre", genre: "Reality TV",
    tagline: "Unscripted. Mostly." },
  {
    number: 27, name: "CHILLER", kind: "curated",
    tagline: "Leave a light on.",
    // MonsterVision two a night from 8 -- 76 tapes at a ~2h median fills to
    // midnight and runs 38 nights before repeating.
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 20, endHour: 24, pool: [
        "MonsterVision",
      ] },
    ],
    fallbackPool: [
      "Millennium", "BeyondReality", "FreddysNightmares",
      "SapphireandSteel", "AshvsEvilDead", "AmericanGothic1995",
      "Spooksville", "HammerHouseofHorror",
    ],
  },
  {
    number: 28, name: "QUEENS & RAYMOND", kind: "curated",
    tagline: "Married, with in-laws.",
    daypart: [],
    fallbackPool: [
      "EverybodyLovesRaymond", "KingofQueens", "Reba",
    ],
  },
  {
    number: 29, name: "LATE SHOW", kind: "curated",
    tagline: "Past your bedtime.",
    daypart: [],
    fallbackPool: [
      "MADtv", "MASH", "MurphyBrown", "NightCourt", "ConanOBrien",
      "Taxi1978", "WkrpinCincinnati", "InsomniacwithDaveAttell",
      "MarriedWithChildren",
    ],
  },
  {
    number: 30, name: "MIDNIGHT PRECINCT", kind: "curated",
    tagline: "The city that never reruns.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "NorthernExposure", "TwinPeaks", "Rookies",
      "BrooklynSouth", "Chase", "DallastheSeries", "CopRock",
    ],
  },
  {
    number: 31, name: "NIGHTMARE ALLEY", kind: "curated",
    tagline: "Stephen King, wall to wall.",
    daypart: [],
    fallbackPool: [
      "AlfredHitchcockPresents", "TwilightZone1959", "TheShining1997",
      "Tommyknockers", "It1990", "StormOfTheCentury", "TheStand1994",
      "SometimesTheyComeBack", "Langoliers",
    ],
  },
  // Was AreYouAfraidOfTheDark + EerieIndiana, which is EERIE AFTER SCHOOL's
  // (22) whole premise and meant this adult anthology channel ran kids'
  // horror 92% of the week. The three deepest classics from its own window
  // instead.
  {
    number: 32, name: "TWILIGHT HOUR", kind: "curated",
    tagline: "Expect the unexpected, on schedule.",
    daypart: [],
    fallbackPool: [
      "DarkShadowsTheSeries", "AlfredHitchcockPresents",
      "TwilightZone1959", "NewAlfredHitchcockPresents", "Millennium",
      "AmazingStories", "FreddysNightmares", "SapphireandSteel",
      "AshvsEvilDead", "AmericanGothic1995", "HammerHouseofHorror",
      "666ParkAvenueSeries", "BuffyTheVampireSlayer", "NightGallery",
    ],
  },
  {
    number: 33, name: "EERIE AFTER SCHOOL", kind: "curated",
    tagline: "Scary, but you'll still make curfew.",
    daypart: [],
    fallbackPool: [
      "AreYouAfraidOfTheDark", "CaspersScareSchool",
      "CaspertheFriendlyGhost", "BeyondReality", "Spooksville",
      "EerieIndiana", "Goosebumps",
    ],
  },
  {
    number: 34, name: "GUNDAM & GIANT ROBOTS", kind: "curated",
    tagline: "Giant robots, on the hour.",
    daypart: [],
    fallbackPool: [
      "UltimateMuscleSeries", "BeastWarsTransformers",
      "MobileSuitGundamWing", "MobileSuitGundamSEED",
      "MobileSuitGundam00", "MobileSuitGundam0083",
      "MobileSuitGundam08thMSTeam", "MobileSuitGundamMovies",
    ],
  },
  {
    number: 35, name: "DBZ MARATHON", kind: "curated",
    tagline: "It's over 9000 reruns.",
    daypart: [],
    fallbackPool: [
      "DragonBallZ", "DragonBall", "DragonBallSuper", "DragonBallZKai",
      "DragonBallGT", "DragonBallZMovies",
    ],
  },
  {
    number: 36, name: "POKEMON ISLAND", kind: "curated",
    tagline: "Gotta watch 'em all.",
    daypart: [],
    fallbackPool: [
      "Digimon", "PokemonIndigoLeague", "MonsterRancher",
      "PokemonOrangeIslands", "PokmonChronicles",
    ],
  },
  // Elementary-tier cartoons, the pre-1980 half of the split (see SATURDAY
  // MORNING, channel 14, for 1980-onward). Theatrical shorts and the
  // Hanna-Barbera TV era — the name still fits, it just means the vintage
  // funny pages now instead of "the other Saturday". TheWorldofDavidtheGnome
  // (1985) dropped: wrong era for this pool and already the youngest-tier
  // anchor of STORYTIME (51). The shorter vintage pools, plus the two deepest
  // titles from the window for volume — these run 164 h/week, so they carry
  // the channel.
  {
    number: 37, name: "SUNDAY FUNNIES", kind: "curated",
    tagline: "Ink, paint, and nothing after 1979.",
    daypart: [],
    fallbackPool: [
      "PopeyetheSailorMan", "RockyandBullwinkleShow",
      "LOONEYTUNESSERIES", "PeabodysImprobableHistory",
      "LippytheLionandHardyHarHar", "WallyGator",
      "CaspertheFriendlyGhost", "MotormouseandAutocat",
      "WackyRacesSeries", "HermanandKatnip", "CelebritysComicolor",
      "CattanoogaCatstheSeries", "JosieandthePussycatsTVseries",
      "Houndcats",
    ],
  },
  {
    number: 38, name: "PRIME TIME SOAPS", kind: "curated",
    tagline: "Big hair, bigger drama.",
    daypart: [],
    fallbackPool: [
      "PartyOfFive", "NorthernExposure", "TheOC", "Everwood",
      "TwinPeaks", "DallastheSeries",
    ],
  },
  {
    number: 39, name: "WILD WEST & SWORDPLAY", kind: "curated",
    tagline: "Duels, both sword and six-shooter.",
    daypart: [],
    fallbackPool: [
      "Xena", "BriscoCountyJr", "JackofAllTradesTVseries",
      "BarbaryCoast",
    ],
  },
  {
    number: 40, name: "BAYWATCH NIGHTS", kind: "curated",
    tagline: "Slow motion, fast cars.",
    daypart: [],
    fallbackPool: [
      "ATeam", "KnightRider", "Baywatch", "Automan", "BlueThunder",
    ],
  },
  // TRL's own weekday-afternoon slot, the only window it ever aired in --
  // outside it the channel runs the rest of the network's library, including
  // the MTV originals that already live on other channels (BeavisButthead,
  // Daria and AeonFlux on LATE NIGHT CARTOONS; Jackass and CelebrityDeathmatch
  // on STAND-UP & SLAPSTICK) -- same rerun-simulator rule as everywhere else,
  // a show belongs wherever it aired.
  {
    number: 41, name: "MTV", kind: "curated",
    tagline: "I want my MTV.",
    daypart: [
      { days: [1, 2, 3, 4, 5], startHour: 16, endHour: 17, pool: [
        "MtvTrl",
      ] },
    ],
    fallbackPool: [
      "RealWorld", "RoadRules", "Challenge", "Osbournes", "VivaLaBam",
      "PimpMyRide", "MtvTrueLife", "MTVUnplugged", "BeavisButthead", "Daria",
      "AeonFlux", "Jackass", "CelebrityDeathmatch",
    ],
  },
  {
    number: 42, name: "THE WONDER HOUR", kind: "curated",
    tagline: "Growing up, one rerun at a time.",
    daypart: [],
    fallbackPool: [
      "MalcolmInTheMiddle", "WonderYears", "DoogieHowserMD",
      "ParkerLewis",
    ],
  },
  // LivePD is back after being pulled for being unplayable: its old source
  // item needs an archive.org login, but 13 episodes exist on two open items
  // (see data/local-shows/LivePD), and a ride-along is the most on-theme
  // thing this channel could possibly air.
  {
    number: 43, name: "TRUE CRIME TONIGHT", kind: "curated",
    tagline: "Real cops, real stunts, real reruns.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "WorldsWildestPoliceVideos",
      "MostExtremeEliminationChallenge", "BeyondScaredStraight2",
      "Rookies", "Chase", "LivePD", "JuryDutySeries",
    ],
  },
  {
    number: 44, name: "STAND-UP & SLAPSTICK", kind: "curated",
    tagline: "Comedy that might need stitches.",
    daypart: [],
    fallbackPool: [
      "CelebrityDeathmatch", "WhitestKidsUKnow",
      "InsomniacwithDaveAttell", "Jackass",
    ],
  },
  // Teen-tier cartoons — action-adventure, not aimed at little kids but not
  // the adult-humor tier of LATE NIGHT CARTOONS (46) either. Absorbs the old
  // SUPERHERO SQUAD/ACTION TOONS/GUNDAM & GIANT ROBOTS-adjacent titles that
  // used to be scattered across several channels, plus the teen-leaning
  // titles pulled out of the elementary tier (14/27) and the retired
  // NICKTOONS AFTER DARK (RockosModernLife, InvaderZIM). "Tick" (2001
  // live-action), PowerRangers, and RoboCopliveactionTVseries dropped — live
  // action, genre "Drama & Adventure", not actually cartoons despite sitting
  // in this pool before; still reachable via ADVENTURE NETWORK (channel 6).
  {
    number: 45, name: "TEEN ACTION THEATER", kind: "curated",
    tagline: "Capes, transformations, and turtle power.",
    daypart: [],
    fallbackPool: [
      "TeenageMutantNinjaTurtles", "CaptainPlanet", "BatmanTAS", "XMen",
      "TeenTitansSeries", "MutantLeague", "SpiderManTAS",
      "BikerMiceFromMars", "EagleRiders", "RamboTheForceofFreedom",
      "TransformersPrime", "InvaderZIM", "BatmanBeyond",
      "TheMaskAnimatedSeries", "BeastWarsTransformers", "MightyMax",
      "TheTick", "Godzilla", "RockosModernLife", "TMNTNextMutation",
      "MotorcityTVseries", "KarateKid", "StarcomtheUSSpaceForceSeries",
    ],
  },
  {
    number: 46, name: "THE AGENCY", kind: "curated",
    tagline: "Trust no one. Except the schedule.",
    daypart: [],
    fallbackPool: [
      "GetSmart", "Persuaders", "TekWar", "MaxHeadroom",
    ],
  },
  // Spun off from BeavisButthead, which is already the anchor here. Spun off
  // from BeavisButthead, which is already the anchor here. BrakShowSeries and
  // Spawn were previously only reachable via the now-retired TOON CHANNEL's
  // genre sweep — both are genuinely adult content (Adult Swim / HBO-era dark
  // and violent) that TOON CHANNEL's excludeShowIds list never actually
  // caught, so this also fixes a real pre-existing miscategorization, not
  // just a reshuffle.
  {
    number: 47, name: "LATE NIGHT CARTOONS", kind: "curated",
    tagline: "Not for the kids' table.",
    daypart: [],
    fallbackPool: [
      "BeavisButthead", "BigMouth", "Duckman", "Daria", "Boondocks",
      "BobandMargaret", "RenAndStimpy", "MoralOrel", "PJs",
      "DrawnTogether", "BrakShowSeries", "Simpsons", "Oblongs",
      "SpawntheAnimatedSeriesSeries480x480", "Undergrads", "HomeMovies",
      "AeonFlux", "CommonSideEffects",
    ],
  },
  {
    number: 48, name: "ANIME MIDNIGHT", kind: "curated",
    tagline: "Subtitles after dark.",
    daypart: [],
    fallbackPool: [
      "DragonBallZ", "Digimon", "LodossWarSeriesEnglishDub",
      "NeonGenesisEvangelion", "AttackonTitan",
      "MobileSuitGundam0083", "BubblegumCrisistheSeriesDualAudioHD",
    ],
  },
  // Six of the ten titles this pool used to carry were shot in color --
  // HeresLucy, TheMonkees, and the four Hanna-Barbera/Famous Studios cartoons
  // (Peabody, Lippy, WallyGator, HermanandKatnip) -- so the channel's one
  // stated rule was the one thing its pool didn't honor. Now monochrome
  // live-action only; the cartoons went to SUNDAY FUNNIES (36), which is the
  // pre-1980 cartoon channel and where they belong anyway. MisterEd added
  // (b&w for its whole run, and this is a better home for it than a cartoon
  // channel's filler). TheLucyShow is the one compromise: seasons 1-3 are
  // b&w, 4-6 are color, and pools are whole-show only.
  {
    number: 49, name: "BLACK & WHITE HOUR", kind: "curated",
    tagline: "Before color, and none the worse.",
    daypart: [],
    fallbackPool: [
      "LeaveIttoBeavertheSeries", "DickVanDyke", "TheLucyShow",
      "MisterEd", "McHalesNavySeries",
    ],
  },
  // The 8-10pm family block real networks actually ran; outside it the
  // channel keeps to the same era rather than going somewhere else entirely.
  {
    number: 50, name: "FAMILY HOUR", kind: "curated",
    tagline: "A lesson learned before the credits.",
    daypart: [],
    fallbackPool: [
      "CosbyShow", "FactsofLife", "MamasFamily",
      "TheHoganFamily", "HighwayToHeaven", "ALFtheSeries",
      "ArchieBunkersPlace", "LifeGoesOn", "HarryandtheHendersons",
      "BlessThisHouse", "JusttheTenofUs", "BosomBuddies", "ItsYourMove",
    ],
  },
  {
    number: 51, name: "APARTMENT 5B", kind: "curated",
    tagline: "Nobody here has a real job.",
    daypart: [],
    fallbackPool: [
      "Nanny", "Reba", "UnhappilyEverAfter", "AreWeThereYet",
      "StillStanding", "WhatILikeAboutYou", "VeronicasCloset",
      "DharmaAndGreg", "RudeAwakening", "NedAndStacey", "Joey",
      "SoulMan", "BernieMacShow",
    ],
  },
  // A real weekday pre-school block: mornings for the youngest end of the
  // pool, with the after-school-aged shows as the rest of the day's filler.
  {
    number: 52, name: "STORYTIME", kind: "curated",
    tagline: "Read along if you like.",
    daypart: [],
    fallbackPool: [
      "AdventuresinWonderland", "BerenstainBears", "Ghostwriter",
      "NickArcade", "LittleBear", "CliffordtheBigRedDogSeriesSeries",
      "Zoboomafoo", "RoundtheTwist", "BertandErniesGreatAdventures",
      "Wishbone", "MouseFactory", "MrMen", "LandOfTheLost1991",
      "TheWorldofDavidtheGnome", "JimHensonHour",
      "WonderPetsEpisodeswithMissingEpisodes",
    ],
  },
  // WhoseLineIsItAnyway is improv rather than sketch, but it's the same
  // half-hour studio-comedy shape and it nearly doubles the channel's depth
  // on its own (173.5h against the other five's 114.5h).
  {
    number: 53, name: "SKETCH VAULT", kind: "curated",
    tagline: "Bits, and nothing but.",
    daypart: [],
    fallbackPool: [
      "WhoseLineIsItAnyway", "InLivingColor", "MontyPythonsFlyingCircus",
      "ABCsFridays", "BenStillerShow", "HeyVernIt",
    ],
  },
  // Short-run and burned-off series — the pool is deliberately made of shows
  // that never got a second season, which is the whole premise of the channel
  // rather than an accident of what was left over.
  {
    number: 54, name: "CULT & CANCELLED", kind: "curated",
    tagline: "Thirteen episodes, no more.",
    daypart: [],
    fallbackPool: [
      "Jericho", "Animorphs", "TheNetAmericanTVseries",
      "MortalKombatConquest", "BakersfieldPD", "TeenAngel", "WeberShow",
      "LoneGunmen", "Ted", "FireflySeries",
      "CavemenSeriesSlightlyBetterQuality", "Action", "Tucker",
      "YouWish", "Mulaney", "LifeAsWeKnowIt", "Middleman", "Woops",
    ],
  },
  // Sunday 8-10pm horror block, the same slot CATASTROPHE CHANNEL uses for
  // disaster movies -- this is its monster-movie counterpart, pairing
  // MonsterVision with every King TV movie at once (NIGHTMARE ALLEY never
  // runs Sundays, so this doesn't just duplicate it). Was MonsterVision
  // again, so the Sunday block's own premise only ever reached 2 of 168 hours
  // and the channel was channel 32 the rest of the week. Now the theatrical
  // horror the block pairs with: same genre, none of it on 19, 20 or 55.
  {
    number: 55, name: "CREATURE DOUBLE FEATURE", kind: "curated",
    tagline: "Monsters, madmen, and made-for-TV mayhem.",
    daypart: [],
    fallbackPool: [
      "MonsterVision", "TheShining1997", "Tommyknockers", "TheExorcist",
      "TheTexasChainsawMassacre2", "AmericanWerewolfInLondon", "Trucks",
      "CurseOfTheBlairWitch", "TheDeadZone", "SingleWhiteFemale",
      "ShallowGrave", "TheBeast", "It1990", "StormOfTheCentury",
      "TheStand1994", "SometimesTheyComeBack", "Langoliers",
    ],
  },
  {
    number: 56, name: "60s & 70s SITCOM HOUR", kind: "curated",
    tagline: "Before the laugh track needed subtitles.",
    daypart: [],
    fallbackPool: [
      "MASH", "Jeffersons", "PetticoatJunction", "GreenAcres",
      "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow", "HeresLucy",
      "MisterEd", "GetSmart", "Taxi1978", "McHalesNavySeries",
      "WkrpinCincinnati", "AllInTheFamily", "TheMonkees",
    ],
  },
  // LeaveIttoBeavertheSeries (1957-63) dropped -- it was this channel's
  // single largest title by airtime at 9.7%, on an 80s channel, while also
  // sitting on BLACK & WHITE HOUR (48) where it actually belongs.
  // SavedByTheBell, FamilyMatters, LifeGoesOn and HeyDude moved to 90s
  // SITCOMS (57): all four premiered in 1989 and ran the bulk of their
  // episodes in the 90s.
  {
    number: 57, name: "80s SITCOMS", kind: "curated",
    tagline: "Shoulder pads and setups.",
    daypart: [],
    fallbackPool: [
      "MurphyBrown", "CosbyShow", "FactsofLife", "Newhart", "NightCourt",
      "GrowingPains", "MamasFamily", "TheHoganFamily",
      "ALFtheSeries", "ArchieBunkersPlace", "PunkyBrewster",
      "JusttheTenofUs", "BosomBuddies", "MarriedWithChildren",
      "ItsYourMove",
    ],
  },
  // Moved off 80s SITCOMS (56): 1989 premieres that ran into the mid-90s.
  // Same rule: premiered Feb 1989, but ran nine seasons to 1997, so all but
  // the first are 90s. 1990 premiere; only its first two seasons exist here,
  // both 1990-91. 1995-99, complete run, squarely 90s. Moved off 2000s
  // SITCOMS (58): 1999.
  {
    number: 58, name: "90s SITCOMS", kind: "curated",
    tagline: "Must-see, whenever you tune in.",
    daypart: [],
    fallbackPool: [
      "DrewCareyShow", "FamilyMatters", "EverybodyLovesRaymond",
      "KingofQueens", "SavedByTheBell", "HomeImprovement", "Coach",
      "MadAboutYou", "Nanny", "UnhappilyEverAfter", "NewsRadio",
      "CarolineInTheCity", "LifeGoesOn", "AlexMack", "ParkerLewis",
      "VeronicasCloset", "HeyDude", "DharmaAndGreg", "RudeAwakening",
      "NedAndStacey", "Popular", "JeffFoxworthyShow", "Wings",
      "SaluteYourShorts", "ZoeDuncanJackJane", "SoulMan",
      "ShastaMcNasty", "TeenAngel", "BakersfieldPD", "YouWish", "Action",
      "StepByStep", "CaliforniaDreams",
    ],
  },
  // Four titles dropped as out-of-decade, which had made the tagline below
  // literally false: Mulaney (2014) and Ted (2024) both post-date the
  // mockumentary era this channel claims to precede, AreWeThereYet ran
  // 2010-13 (and was 13% of the channel's airtime), ShastaMcNasty was 1999
  // and moved to 90s SITCOMS (57). Mulaney and Ted keep their real home on
  // CULT & CANCELLED (53), which is where short-run series belong regardless
  // of decade.
  {
    number: 59, name: "2000s SITCOMS", kind: "curated",
    tagline: "The last sitcoms before the mockumentary took over.",
    daypart: [],
    fallbackPool: [
      "MalcolmInTheMiddle", "Reba", "StillStanding", "WhatILikeAboutYou",
      "Joey", "BernieMacShow", "WeberShow", "BacktoYou",
      "CavemenSeriesSlightlyBetterQuality", "Tucker", "That70sShow",
      "WillAndGrace",
    ],
  },
  {
    number: 60, name: "SLAPSTICK & SCREWBALL", kind: "curated",
    tagline: "Nobody here keeps a straight face.",
    daypart: [],
    fallbackPool: [
      "PetticoatJunction", "GreenAcres", "MisterEd", "GetSmart",
      "McHalesNavySeries", "ShastaMcNasty", "MarriedWithChildren",
      "TeenAngel", "CavemenSeriesSlightlyBetterQuality", "Woops",
    ],
  },

  // -- VBO: the movie tier (61-67) ----------------------------------------------------
  // ~400 feature films came into VaultVision at once, and they don't belong on
  // the rerun channels above -- a 100-minute movie dropped into a sitcom
  // rotation is most of an evening of it. So they get the premium-movie-channel
  // treatment instead: a flagship pair carrying everything, then one channel
  // per genre, all of them `kind: "genre"` sweeps that pick up new films with
  // no curation the moment tools/build-catalog.py runs again.
  //
  // VBO and VBO 2 share one pool, and `seed` is the only thing separating
  // them -- same library, different shuffle, so tuning 60 -> 61 always lands
  // on a different film. That's what the real second feed of a movie channel
  // was: the same month's lineup, offset.
  { number: 61, name: "VBO", kind: "genre", genre: MOVIE_GENRES,
    tagline: "It's not TV." },
  { number: 62, name: "VBO 2", kind: "genre", genre: MOVIE_GENRES, seed: "vbo2",
    tagline: "The other half of the lineup." },
  { number: 63, name: "VBO FAMILY", kind: "genre",
    genre: ["Family & Kids", "Holiday"],
    tagline: "Everybody in the room." },
  { number: 64, name: "VBO DRAMA", kind: "genre", genre: "Drama",
    tagline: "Nobody says a word for two hours." },
  { number: 65, name: "VBO COMEDY", kind: "genre", genre: "Comedy",
    tagline: "Uncut, unedited, unaired-on-basic." },
  // Sci-fi rides with action rather than getting its own channel: 37 films is
  // thin for a 24h loop on its own, and the two shelves always shared one
  // anyway.
  { number: 66, name: "VBO ACTION", kind: "genre",
    genre: ["Action & Adventure", "Sci-Fi & Fantasy"],
    tagline: "Explosions on a schedule." },
  { number: 67, name: "VBO HORROR", kind: "genre", genre: "Horror",
    tagline: "Late enough that it counts." },
];
