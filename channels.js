// The channel lineup. Two kinds of channel:
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
//
// `daypart[].days` is 0=Sunday..6=Saturday (Date#getDay()). Windows must not
// overlap for a single channel; the scheduler takes the first match.
// `tagline` is pure flavor, shown under the channel name in the OSD banner.
//
// Several channels below are single-show pools built from VaultVision shows
// that are themselves recordings of real broadcast blocks (FoxKids, SNICK,
// NickAtNite, MonsterVision, SciFiAnime, SatMorning, TGIF) — those don't need
// curating at all, they're already exactly what this app is simulating.
//
//   kind: "vod"     — not a scheduled simulation at all: a browsable menu
//                      (see vod.js) driven live off the catalog, sectioned
//                      by genre same as the "genre" channels above. Has no
//                      daypart/pool/genre fields of its own.
//
// The guide doesn't need a numbered channel slot for its own sake — it's
// already reachable via a dedicated action (the on-screen GUIDE button / `g`
// key, see remote.js) independent of any number — so it sits on channel 1
// (formerly deliberately unused, real cable lineups commonly skip it too) to
// free up channel 2, the lowest tunable slot, for VIDEO ON DEMAND. Declaring
// VOD as the very next entry after the guide makes it the topmost row in the
// guide's own listings too (which filter out kind:"guide" but nothing else).
//
// Plain script, not a module (see scheduler.js's header for why) — loaded via
// <script src="channels.js">, so file:// pages can load it too.
const GUIDE_CHANNEL = 1;
const VOD_CHANNEL = 2;
window.GUIDE_CHANNEL = GUIDE_CHANNEL;
window.VOD_CHANNEL = VOD_CHANNEL;

window.CHANNELS = [
  { number: GUIDE_CHANNEL, name: "TV GUIDE", kind: "guide", tagline: "What's on, eventually." },
  { number: VOD_CHANNEL, name: "🎬 VIDEO ON DEMAND", kind: "vod", tagline: "Pick something. Anything." },

  // -- genre channels: one per catalog genre, zero curation -----------------
  // 3 (TOON CHANNEL, genre "Animation") retired — a flat 92-show sweep with
  // no structure to it, all of it now placed by age/tone instead: SATURDAY
  // MORNING/SUNDAY FUNNIES (14/27, general-audience), TEEN ACTION THEATER
  // (43), LATE NIGHT CARTOONS (45, adult). Every Animation-genre show has
  // exactly one home now rather than also being swept here with no curation
  // at all. Left unused rather than renumbering everything above it, same
  // as channel 1.
  { number: 4, name: "SITCOM CENTRAL", kind: "genre", genre: "Sitcoms",
    tagline: "Laugh track included." },
  { number: 5, name: "CLASSIC TV", kind: "genre", genre: "Classic Sitcoms",
    tagline: "Black and white optional." },
  { number: 6, name: "ADVENTURE NETWORK", kind: "genre", genre: "Drama & Adventure",
    tagline: "Car chases guaranteed." },
  { number: 7, name: "ANIME ZONE", kind: "genre", genre: "Anime",
    tagline: "Dubbed, subbed, and everything between." },
  { number: 8, name: "KIDS & LEARNING", kind: "genre", genre: "Kids & Educational",
    tagline: "Homework help, sort of." },
  { number: 9, name: "CHILLER", kind: "genre", genre: "Horror & Anthology",
    tagline: "Leave a light on." },
  { number: 10, name: "LAUGH TRACK", kind: "genre", genre: "Sketch Comedy & Late Night",
    tagline: "Live from a soundstage somewhere." },
  { number: 11, name: "MOVIE VAULT", kind: "genre", genre: "TV Movies",
    tagline: "Feature presentation, every hour." },
  { number: 12, name: "REWIND", kind: "genre", genre: "Broadcast Blocks",
    tagline: "Exactly as it aired." },
  { number: 13, name: "REALITY CHECK", kind: "genre", genre: "Reality TV",
    tagline: "Unscripted. Mostly.",
    // Consistently unplayable (archive.org files error out) — see also its
    // removal from TRUE CRIME TONIGHT's curated pool.
    excludeShowIds: ["LivePDSeriesNotDoneYet"] },

  // -- original curated dayparted channels -----------------------------------
  {
    number: 14, name: "SATURDAY MORNING", kind: "curated",
    tagline: "Cereal not included.",
    // Elementary-tier cartoons, half of the split (see SUNDAY FUNNIES,
    // channel 27, for the rest) — general-audience and nonviolent, the
    // teen-action titles this pool used to also carry (XMen, SpiderManTAS,
    // TeenageMutantNinjaTurtles, CaptainPlanet) moved to TEEN ACTION
    // THEATER (43) instead.
    daypart: [{ days: [6], startHour: 8, endHour: 12, pool: [
      "MuppetBabies", "GarfieldandFriendsSeries", "TinyToonAdventures",
      "Animaniacs", "DuckTalesSeriesWorkinProgress", "DarkwingDucktheSeries",
      "LOONEYTUNESSERIES", "RockyandBullwinkleShow", "WackyRacesSeries",
      "PowerpuffGirls", "Recess", "PopeyetheSailorMan",
      "AceVenturaPetDetectiveSeries", "AdventuresOfSonic", "AlvinandtheChipmunks",
      "ArchiesWeirdMysteries", "BobbysWorld", "BuzzLightyearofStarCommand",
      "CampLakebottom", "CaptainN", "CaspersScareSchool",
      "CaspertheFriendlyGhost", "CelebritysComicolor", "CouragetheCowardlyDog",
      "DextersLaboratorytheSeries", "DuckDodgers", "EdEddNEddySeriesAllEpisodesandSpecials",
      "FairlyOddParents", "GarbagePailKids", "GravityFalls",
      "Histeria",
    ] }],
    fallbackPool: [
      "AllInTheFamily", "GreenAcres", "MaryTylerMooreShow", "Newhart",
      "GetSmart", "Jeffersons", "MisterEd", "PetticoatJunction",
    ],
  },
  {
    number: 15, name: "TGIF SITCOMS", kind: "curated",
    tagline: "Thank goodness it's curated.",
    daypart: [{ days: [5], startHour: 20, endHour: 22, pool: [
      "FamilyMatters", "StepByStep", "SavedByTheBell", "GrowingPains", "PunkyBrewster",
    ] }],
    fallbackPool: [
      "MadAboutYou", "HomeImprovement", "EverybodyLovesRaymond",
      "KingofQueens", "DrewCareyShow", "NewsRadio",
    ],
  },
  {
    number: 16, name: "LATE SHOW", kind: "curated",
    tagline: "Past your bedtime.",
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 23, endHour: 24, pool: [
        "ConanOBrien", "MADtv", "InsomniacwithDaveAttell", "NightCourt", "MASH",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 2, pool: [
        "ConanOBrien", "MADtv", "InsomniacwithDaveAttell", "NightCourt", "MASH",
      ] },
    ],
    fallbackPool: [
      "MarriedWithChildren", "Taxi1978", "WkrpinCincinnati", "MurphyBrown",
    ],
  },

  // -- new cross-genre "networks" ---------------------------------------------
  {
    number: 17, name: "STARSHIP", kind: "curated",
    tagline: "Boldly rerunning.",
    daypart: [],
    fallbackPool: [
      "StarTrekTNG", "StarTrekDS9", "StarTrekVoyager", "BattlestarGalactica",
      "DoctorWho", "Space1999", "V1983", "BuckRogers", "MaxHeadroom",
      "HitchhikersGuidetotheGalaxy", "GeneRoddenberrysAndromeda", "LogansRun",
    ],
  },
  {
    number: 18, name: "MIDNIGHT PRECINCT", kind: "curated",
    tagline: "The city that never reruns.",
    daypart: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 22, endHour: 24, pool: [
      "NYPDBlue", "BrooklynSouth", "Rookies", "Chase", "CopRock",
    ] }],
    fallbackPool: ["DallastheSeries", "TwinPeaks", "NorthernExposure"],
  },
  {
    number: 19, name: "CATASTROPHE CHANNEL", kind: "curated",
    tagline: "The end of the world, every night at 8.",
    daypart: [{ days: [0], startHour: 20, endHour: 22, pool: [
      "Tornado1996", "VolcanoFireOnTheMountain", "Asteroid1997",
      "Meteorites1998", "WithoutWarning1994", "Y2KTheMovie",
    ] }],
    fallbackPool: ["TheShining1997", "TheStand1994"],
  },
  {
    number: 20, name: "NIGHTMARE ALLEY", kind: "curated",
    tagline: "Stephen King, wall to wall.",
    daypart: [{ days: [5, 6], startHour: 21, endHour: 24, pool: [
      "It1990", "StormOfTheCentury", "TheShining1997",
      "TheStand1994", "Tommyknockers", "SometimesTheyComeBack",
    ] }],
    fallbackPool: ["TwilightZone1959", "AlfredHitchcockPresents"],
  },
  {
    number: 21, name: "TWILIGHT HOUR", kind: "curated",
    tagline: "Expect the unexpected, on schedule.",
    daypart: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 21, endHour: 23, pool: [
      "TwilightZone1959", "AlfredHitchcockPresents", "NewAlfredHitchcockPresents",
      "AmazingStories", "Millennium", "DarkShadowsTheSeries", "SapphireandSteel",
      "HammerHouseofHorror", "666ParkAvenueSeries", "AmericanGothic1995",
      "FreddysNightmares", "AshvsEvilDead",
    ] }],
    fallbackPool: ["AreYouAfraidOfTheDark", "EerieIndiana"],
  },
  {
    number: 22, name: "EERIE AFTER SCHOOL", kind: "curated",
    tagline: "Scary, but you'll still make curfew.",
    daypart: [{ days: [1, 2, 3, 4, 5], startHour: 15, endHour: 17, pool: [
      "AreYouAfraidOfTheDark", "EerieIndiana", "Spooksville", "BeyondReality",
    ] }],
    fallbackPool: ["CaspertheFriendlyGhost", "CaspersScareSchool"],
  },
  {
    number: 23, name: "GUNDAM & GIANT ROBOTS", kind: "curated",
    tagline: "Giant robots, on the hour.",
    daypart: [],
    fallbackPool: [
      "MobileSuitGundam00", "MobileSuitGundam0083", "MobileSuitGundam08thMSTeam",
      "MobileSuitGundamMovies", "MobileSuitGundamSEED", "MobileSuitGundamWing",
      "BeastWarsTransformers", "UltimateMuscleSeries",
    ],
  },
  {
    number: 24, name: "DBZ MARATHON", kind: "curated",
    tagline: "It's over 9000 reruns.",
    daypart: [],
    fallbackPool: [
      "DragonBall", "DragonBallZ", "DragonBallZKai", "DragonBallGT",
      "DragonBallSuper", "DragonBallZMovies",
    ],
  },
  {
    number: 25, name: "POKEMON ISLAND", kind: "curated",
    tagline: "Gotta watch 'em all.",
    daypart: [],
    fallbackPool: ["PokemonIndigoLeague", "PokemonOrangeIslands", "PokmonChronicles",
      "Digimon", "MonsterRancher"],
  },
  // 26 (NICKTOONS AFTER DARK) retired — most of its pool was live-action
  // Nickelodeon shows (HeyDude, SaluteYourShorts, AllegrasWindow, GUTS), not
  // cartoons at all, and already reachable via their own genres (Classic
  // Sitcoms/Kids & Educational). Its two real teen-tier cartoons
  // (RockosModernLife, InvaderZIM) moved to TEEN ACTION THEATER (43);
  // CouragetheCowardlyDog and EdEddNEddy... moved to the elementary tier
  // (14); RenAndStimpy was already on LATE NIGHT CARTOONS (45) as adult.
  // Left unused rather than renumbering everything above it, same as
  // channel 1.
  {
    number: 27, name: "SUNDAY FUNNIES", kind: "curated",
    tagline: "The other Saturday morning (on a Sunday).",
    // Elementary-tier cartoons, the other half of the split (see SATURDAY
    // MORNING, channel 14).
    daypart: [{ days: [0], startHour: 8, endHour: 12, pool: [
      "Beetlejuice", "CattanoogaCatstheSeries", "HeathcliffandtheCatillacCatsTVSeries",
      "InspectorGadget", "MightyMousetheNewAdventures", "PolePosition",
      "PoliceAcademyTheAnimatedSeries", "CampCandy", "HermanandKatnip",
      "Houndcats", "JosieandthePussycatsTVseries", "KaBlam",
      "LandBeforeTime", "LippytheLionandHardyHarHar", "MorphFiles",
      "MotormouseandAutocat", "PeabodysImprobableHistory", "SonictheHedgehog",
      "SpongeBobSquarePants", "SwanBoy", "WallyGator",
      "TheWorldofDavidtheGnome",
    ] }],
    fallbackPool: ["LOONEYTUNESSERIES", "RockyandBullwinkleShow"],
  },

  // -- literal recorded broadcast blocks, each its own channel ----------------
  { number: 28, name: "FOX KIDS", kind: "curated", tagline: "Gotta catch the whole Saturday.",
    daypart: [], fallbackPool: ["FoxKids"] },
  { number: 29, name: "SNICK", kind: "curated", tagline: "The last polka before bed.",
    daypart: [], fallbackPool: ["SNICK"] },
  { number: 30, name: "NICK AT NITE", kind: "curated", tagline: "Reruns, exactly as recorded.",
    daypart: [], fallbackPool: ["NickAtNite"] },
  // 31 (USA UP ALL NIGHT) retired -- its one show (USAUpAllNight) leaned
  // heavily on tasteless content with no redeeming value, unlike the rest
  // of the lineup, and is excluded from the catalog entirely (see
  // tools/build-catalog.py's EXCLUDED_SHOWS) rather than just left off
  // every channel's pool, so it can't resurface via a future genre-channel
  // addition either. Left unused rather than renumbering everything above
  // it, same as channel 1.
  { number: 32, name: "MONSTERVISION", kind: "curated", tagline: "Joe Bob's basement, streaming forever.",
    daypart: [], fallbackPool: ["MonsterVision"] },
  { number: 33, name: "SCI-FI SATURDAY ANIME", kind: "curated", tagline: "Anime, exactly as broadcast.",
    daypart: [], fallbackPool: ["SciFiAnime"] },
  { number: 34, name: "SAT MORNING (ABC/NBC/CBS)", kind: "curated", tagline: "The other networks' Saturday.",
    daypart: [], fallbackPool: ["SatMorning"] },
  { number: 35, name: "THE FRIDAY TAPE", kind: "curated", tagline: "Somebody's VHS, every Friday.",
    daypart: [], fallbackPool: ["TGIF"] },

  // -- more cross-genre networks -----------------------------------------------
  {
    number: 36, name: "PRIME TIME SOAPS", kind: "curated",
    tagline: "Big hair, bigger drama.",
    daypart: [],
    fallbackPool: ["DallastheSeries", "TwinPeaks", "PartyOfFive", "Everwood",
      "NorthernExposure", "TheOC"],
  },
  {
    number: 37, name: "WILD WEST & SWORDPLAY", kind: "curated",
    tagline: "Duels, both sword and six-shooter.",
    daypart: [],
    fallbackPool: ["Xena", "JackofAllTradesTVseries", "BriscoCountyJr", "BarbaryCoast"],
  },
  {
    number: 38, name: "BAYWATCH NIGHTS", kind: "curated",
    tagline: "Slow motion, fast cars.",
    daypart: [],
    fallbackPool: ["Baywatch", "KnightRider", "ATeam", "Automan", "BlueThunder"],
  },
  {
    number: 39, name: "THE WONDER HOUR", kind: "curated",
    tagline: "Growing up, one rerun at a time.",
    daypart: [],
    fallbackPool: ["WonderYears", "DoogieHowserMD", "ParkerLewis", "MalcolmInTheMiddle"],
  },
  {
    number: 40, name: "THE LEARNING CHANNEL", kind: "curated",
    tagline: "Edutainment, on a schedule.",
    daypart: [],
    fallbackPool: ["BillNye", "CosmosaPersonalVoyage", "SchoolhouseRock",
      "PlanetEarth", "MartyStouffersWildAmerica"],
  },
  {
    number: 41, name: "TRUE CRIME TONIGHT", kind: "curated",
    tagline: "Real cops, real stunts, real reruns.",
    daypart: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 21, endHour: 23, pool: [
      "WorldsWildestPoliceVideos",
      "MostExtremeEliminationChallenge", "BeyondScaredStraight2", "JuryDutySeries",
    ] }],
    fallbackPool: ["NYPDBlue", "Rookies", "Chase"],
  },
  {
    number: 42, name: "STAND-UP & SLAPSTICK", kind: "curated",
    tagline: "Comedy that might need stitches.",
    daypart: [],
    fallbackPool: ["Jackass", "CelebrityDeathmatch", "WhitestKidsUKnow", "InsomniacwithDaveAttell"],
  },
  {
    number: 43, name: "TEEN ACTION THEATER", kind: "curated",
    tagline: "Capes, transformations, and turtle power.",
    // Teen-tier cartoons — action-adventure, not aimed at little kids but
    // not the adult-humor tier of LATE NIGHT CARTOONS (45) either. Absorbs
    // the old SUPERHERO SQUAD/ACTION TOONS/GUNDAM & GIANT ROBOTS-adjacent
    // titles that used to be scattered across several channels, plus the
    // teen-leaning titles pulled out of the elementary tier (14/27) and the
    // retired NICKTOONS AFTER DARK (RockosModernLife, InvaderZIM). "Tick"
    // (2001 live-action), PowerRangers, and RoboCopliveactionTVseries
    // dropped — live action, genre "Drama & Adventure", not actually
    // cartoons despite sitting in this pool before; still reachable via
    // ADVENTURE NETWORK (channel 6).
    daypart: [],
    fallbackPool: ["BatmanTAS", "BatmanBeyond", "XMen", "SpiderManTAS",
      "TeenTitansSeries", "TheMaskAnimatedSeries", "TheTick",
      "BeastWarsTransformers", "BikerMiceFromMars", "CaptainPlanet", "EagleRiders",
      "Godzilla", "InvaderZIM", "KarateKid", "MightyMax", "MotorcityTVseries",
      "MutantLeague", "RamboTheForceofFreedom", "RockosModernLife",
      "StarcomtheUSSpaceForceSeries", "TMNTNextMutation", "TeenageMutantNinjaTurtles",
      "TransformersPrime"],
  },
  {
    number: 44, name: "THE AGENCY", kind: "curated",
    tagline: "Trust no one. Except the schedule.",
    daypart: [],
    fallbackPool: ["Persuaders", "GetSmart", "MaxHeadroom", "TekWar"],
  },
  {
    number: 45, name: "LATE NIGHT CARTOONS", kind: "curated",
    tagline: "Not for the kids' table.",
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 22, endHour: 24, pool: [
        "Duckman", "DrawnTogether", "BigMouth", "Oblongs", "HomeMovies",
        "BobandMargaret", "Undergrads", "MoralOrel", "AeonFlux", "Boondocks",
        "PJs", "BeavisButthead", "BrakShowSeries", "SpawntheAnimatedSeriesSeries480x480",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 1, pool: [
        "Duckman", "DrawnTogether", "BigMouth", "Oblongs", "HomeMovies",
        "BobandMargaret", "Undergrads", "MoralOrel", "AeonFlux", "Boondocks",
        "PJs", "BeavisButthead", "BrakShowSeries", "SpawntheAnimatedSeriesSeries480x480",
      ] },
    ],
    // BrakShowSeries and Spawn were previously only reachable via the
    // now-retired TOON CHANNEL's genre sweep — both are genuinely adult
    // content (Adult Swim / HBO-era dark and violent) that TOON CHANNEL's
    // excludeShowIds list never actually caught, so this also fixes a real
    // pre-existing miscategorization, not just a reshuffle.
    fallbackPool: ["Simpsons", "RenAndStimpy"],
  },
  {
    number: 46, name: "ANIME MIDNIGHT", kind: "curated",
    tagline: "Subtitles after dark.",
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 23, endHour: 24, pool: [
        "NeonGenesisEvangelion", "Berserk1997", "AttackonTitan",
        "BubblegumCrisistheSeriesDualAudioHD", "LodossWarSeriesEnglishDub",
        "MobileSuitGundam0083",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 2, pool: [
        "NeonGenesisEvangelion", "Berserk1997", "AttackonTitan",
        "BubblegumCrisistheSeriesDualAudioHD", "LodossWarSeriesEnglishDub",
        "MobileSuitGundam0083",
      ] },
    ],
    fallbackPool: ["DragonBallZ", "Digimon"],
  },

  // -- channels 49-54: built from what the curated lineup above never picked --
  // The genre channels already sweep every show in the catalog, so nothing
  // here is about coverage — these are themed pools drawn from the ~125 shows
  // no curated channel had claimed, which is where the leftovers happened to
  // cluster once they were sorted by era and tone.
  // 47 (MODERN TOONS) and 48 (ACTION TOONS) retired — both entirely
  // cartoons, redistributed into the elementary tier (14/27) and TEEN
  // ACTION THEATER (43) by the same age/tone split the rest of the animated
  // lineup got. Left unused rather than renumbering everything above them,
  // same as channel 1.
  {
    number: 49, name: "BLACK & WHITE HOUR", kind: "curated",
    tagline: "Before color, and none the worse.",
    daypart: [],
    fallbackPool: [
      "LeaveIttoBeavertheSeries", "DickVanDyke", "TheLucyShow", "HeresLucy",
      "McHalesNavySeries", "TheMonkees", "PeabodysImprobableHistory",
      "LippytheLionandHardyHarHar", "WallyGator", "HermanandKatnip",
    ],
  },
  {
    number: 50, name: "FAMILY HOUR", kind: "curated",
    tagline: "A lesson learned before the credits.",
    // The 8-10pm family block real networks actually ran; outside it the
    // channel keeps to the same era rather than going somewhere else entirely.
    daypart: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 20, endHour: 22, pool: [
      "Roseanne", "CosbyShow", "FactsofLife", "DesigningWomen", "MamasFamily",
      "TheHoganFamily", "ALFtheSeries", "LifeGoesOn", "JusttheTenofUs",
      "ArchieBunkersPlace", "HighwayToHeaven",
    ] }],
    fallbackPool: ["BlessThisHouse", "BosomBuddies", "ItsYourMove", "HarryandtheHendersons"],
  },
  {
    number: 51, name: "APARTMENT 5B", kind: "curated",
    tagline: "Nobody here has a real job.",
    daypart: [],
    fallbackPool: [
      "Seinfeld", "Nanny", "DharmaAndGreg", "VeronicasCloset", "NedAndStacey",
      "Joey", "RudeAwakening", "WhatILikeAboutYou", "StillStanding", "Reba",
      "UnhappilyEverAfter", "BernieMacShow", "AreWeThereYet", "SoulMan",
    ],
  },
  {
    number: 52, name: "STORYTIME", kind: "curated",
    tagline: "Read along if you like.",
    // A real weekday pre-school block: mornings for the youngest end of the
    // pool, with the after-school-aged shows as the rest of the day's filler.
    daypart: [{ days: [1, 2, 3, 4, 5], startHour: 7, endHour: 11, pool: [
      "LittleBear", "BerenstainBears", "CliffordtheBigRedDogSeriesSeries",
      "Zoboomafoo", "BertandErniesGreatAdventures", "MrMen",
      "WonderPetsEpisodeswithMissingEpisodes", "TheWorldofDavidtheGnome",
    ] }],
    fallbackPool: [
      "AdventuresinWonderland", "Ghostwriter", "Wishbone", "RoundtheTwist",
      "NickArcade", "JimHensonHour", "LandOfTheLost1991", "MouseFactory",
    ],
  },
  {
    number: 53, name: "SKETCH VAULT", kind: "curated",
    tagline: "Bits, and nothing but.",
    daypart: [],
    fallbackPool: [
      "InLivingColor", "MontyPythonsFlyingCircus", "ABCsFridays",
      "BenStillerShow", "HeyVernIt",
    ],
  },
  {
    number: 54, name: "CULT & CANCELLED", kind: "curated",
    tagline: "Thirteen episodes, no more.",
    // Short-run and burned-off series — the pool is deliberately made of shows
    // that never got a second season, which is the whole premise of the
    // channel rather than an accident of what was left over.
    daypart: [],
    fallbackPool: [
      "FireflySeries", "LoneGunmen", "Middleman", "Jericho", "TheNetAmericanTVseries",
      "Action", "BakersfieldPD", "Woops", "Tucker", "YouWish", "TeenAngel",
      "WeberShow", "Mulaney", "CavemenSeriesSlightlyBetterQuality", "Ted",
      "MortalKombatConquest", "Animorphs", "LifeAsWeKnowIt",
    ],
  },

  // -- more movie channels ------------------------------------------------
  // The catalog only has 12 shows actually tagged genre "TV Movies" (all of
  // it already split between CATASTROPHE CHANNEL and NIGHTMARE ALLEY, with
  // MOVIE VAULT as their automatic combined pool) -- no untapped TV-movie
  // content exists to build more channels from without repeating titles.
  // What the catalog *does* have is depth inside two "Broadcast Blocks"
  // shows that are themselves nothing but movies, one per episode:
  // MonsterVision (76 films) and USA Up All Night (40). Pools work at whole-
  // show granularity, not per-episode, so a new channel can't cherry-pick a
  // subset of either show's episodes -- these three instead get their
  // variety from *combining* whole shows differently (and, for CREATURE
  // DOUBLE FEATURE, a different daypart) than any existing channel does.
  {
    number: 55, name: "DOUBLE FEATURE DRIVE-IN", kind: "curated",
    tagline: "Two movies, no host, no waiting.",
    // USAUpAllNight (its original co-star here) was retired outright -- see
    // the note by channel 31. Left as MonsterVision alone rather than
    // renumbering/removing this slot too, even though that now overlaps
    // channels 32 and 57.
    daypart: [],
    fallbackPool: ["MonsterVision"],
  },
  {
    number: 56, name: "MATINEE MADNESS", kind: "curated",
    tagline: "Popcorn movies, any time of day.",
    daypart: [],
    // The same 12 shows MOVIE VAULT's genre pool sweeps automatically, but
    // as its own independently-seeded curated pool -- a different shuffle
    // order and no genre-channel coupling, so it airs something different
    // at any given moment than channel 11 does.
    fallbackPool: [
      "Tornado1996", "VolcanoFireOnTheMountain", "Asteroid1997", "Meteorites1998",
      "WithoutWarning1994", "Y2KTheMovie", "It1990", "StormOfTheCentury",
      "TheShining1997", "TheStand1994", "Tommyknockers", "SometimesTheyComeBack",
    ],
  },
  {
    number: 57, name: "CREATURE DOUBLE FEATURE", kind: "curated",
    tagline: "Monsters, madmen, and made-for-TV mayhem.",
    // Sunday 8-10pm horror block, the same slot CATASTROPHE CHANNEL uses for
    // disaster movies -- this is its monster-movie counterpart, pairing
    // MonsterVision with every King TV movie at once (NIGHTMARE ALLEY never
    // runs Sundays, so this doesn't just duplicate it).
    daypart: [{ days: [0], startHour: 20, endHour: 22, pool: [
      "MonsterVision", "It1990", "StormOfTheCentury", "TheShining1997",
      "TheStand1994", "Tommyknockers", "SometimesTheyComeBack",
    ] }],
    fallbackPool: ["MonsterVision"],
  },

  // -- more sitcom channels -------------------------------------------------
  // SITCOM CENTRAL (4) and CLASSIC TV (5) still sweep every Sitcoms/Classic
  // Sitcoms show automatically and stay as-is — but with 79 shows between
  // the two genres shuffled into one undifferentiated pool each, an
  // individual show (The Drew Carey Show, say) has no discoverable identity
  // of its own, just a chance of coming up in rotation. These four are
  // organized by era, plus one by tone (screwball/slapstick shows share a
  // sensibility that cuts across every decade, so it gets its own channel
  // rather than being split four ways). None of this retires the genre
  // channels the way the cartoon reorg retired TOON CHANNEL — every show
  // below is already reachable there too; this just gives more of them a
  // proper home.
  {
    number: 58, name: "60s & 70s SITCOM HOUR", kind: "curated",
    tagline: "Before the laugh track needed subtitles.",
    daypart: [],
    fallbackPool: [
      "DickVanDyke", "TheLucyShow", "HeresLucy", "GreenAcres",
      "PetticoatJunction", "MisterEd", "TheMonkees", "McHalesNavySeries",
      "AllInTheFamily", "Jeffersons", "MaryTylerMooreShow", "GetSmart",
      "Taxi1978", "WkrpinCincinnati", "MASH",
    ],
  },
  {
    number: 59, name: "80s SITCOMS", kind: "curated",
    tagline: "Shoulder pads and setups.",
    daypart: [],
    fallbackPool: [
      "FamilyMatters", "GrowingPains", "PunkyBrewster", "SavedByTheBell",
      "FactsofLife", "DesigningWomen", "ALFtheSeries", "NightCourt",
      "Newhart", "MurphyBrown", "Roseanne", "MarriedWithChildren",
      "BosomBuddies", "CosbyShow", "ArchieBunkersPlace", "MamasFamily",
      "HeyDude", "TheHoganFamily", "LifeGoesOn", "JusttheTenofUs",
      "ItsYourMove", "LeaveIttoBeavertheSeries",
    ],
  },
  {
    number: 60, name: "90s SITCOMS", kind: "curated",
    tagline: "Must-see, whenever you tune in.",
    daypart: [],
    fallbackPool: [
      "MadAboutYou", "HomeImprovement", "Seinfeld", "NewsRadio",
      "Nanny", "VeronicasCloset", "NedAndStacey", "StepByStep",
      "ParkerLewis", "TeenAngel", "YouWish", "UnhappilyEverAfter",
      "JeffFoxworthyShow", "SoulMan", "BakersfieldPD", "AlexMack",
      "SaluteYourShorts", "DharmaAndGreg", "EverybodyLovesRaymond", "KingofQueens",
      "DrewCareyShow", "ZoeDuncanJackJane", "Popular", "Action",
      "RudeAwakening",
    ],
  },
  {
    number: 61, name: "2000s SITCOMS", kind: "curated",
    tagline: "The last sitcoms before the mockumentary took over.",
    daypart: [],
    fallbackPool: [
      "MalcolmInTheMiddle", "BernieMacShow", "StillStanding", "Reba",
      "AreWeThereYet", "Mulaney", "CavemenSeriesSlightlyBetterQuality", "Ted",
      "Tucker", "WeberShow", "Joey", "ShastaMcNasty",
      "WhatILikeAboutYou", "BacktoYou",
    ],
  },
  {
    number: 62, name: "SLAPSTICK & SCREWBALL", kind: "curated",
    tagline: "Nobody here keeps a straight face.",
    daypart: [],
    fallbackPool: [
      "GetSmart", "MisterEd", "GreenAcres", "MarriedWithChildren", "Woops",
      "TeenAngel", "CavemenSeriesSlightlyBetterQuality", "ShastaMcNasty",
      "McHalesNavySeries", "PetticoatJunction",
    ],
  },
];
