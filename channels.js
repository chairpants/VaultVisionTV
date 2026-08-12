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
// NickAtNite, USAUpAllNight, MonsterVision, SciFiAnime, SatMorning, TGIF) —
// those don't need curating at all, they're already exactly what this app
// is simulating.
//
// Channel 1 is deliberately unused — real cable lineups commonly skip it too.
//
// Plain script, not a module (see scheduler.js's header for why) — loaded via
// <script src="channels.js">, so file:// pages can load it too.
const GUIDE_CHANNEL = 2;
window.GUIDE_CHANNEL = GUIDE_CHANNEL;

window.CHANNELS = [
  { number: GUIDE_CHANNEL, name: "TV GUIDE", kind: "guide", tagline: "What's on, eventually." },

  // -- genre channels: one per catalog genre, zero curation -----------------
  { number: 3, name: "TOON CHANNEL", kind: "genre", genre: "Animation",
    tagline: "Cartoons, all day, every day.",
    // Adult animation, tagged genre "Animation" same as everything else but
    // not appropriate for this basic-cable-feel channel — already properly
    // curated on LATE NIGHT CARTOONS (channel 45).
    excludeShowIds: [
      "BigMouth", "Duckman", "DrawnTogether", "Oblongs", "HomeMovies",
      "BobandMargaret", "Undergrads", "MoralOrel", "AeonFlux",
      "Boondocks", "PJs", "BeavisButthead",
    ] },
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
    daypart: [{ days: [6], startHour: 8, endHour: 12, pool: [
      "MuppetBabies", "GarfieldandFriendsSeries", "TinyToonAdventures",
      "Animaniacs", "XMen", "SpiderManTAS", "TeenageMutantNinjaTurtles",
      "CaptainPlanet", "DuckTalesSeriesWorkinProgress", "DarkwingDucktheSeries",
      "LOONEYTUNESSERIES", "RockyandBullwinkleShow", "WackyRacesSeries",
      "PowerpuffGirls", "Recess", "PopeyetheSailorMan",
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
      "It1990", "Langoliers", "StormOfTheCentury", "TheShining1997",
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
  {
    number: 26, name: "NICKTOONS AFTER DARK", kind: "curated",
    tagline: "Slime included.",
    daypart: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 19, endHour: 21, pool: [
      "RockosModernLife", "RenAndStimpy", "CouragetheCowardlyDog", "InvaderZIM",
      "EdEddNEddySeriesAllEpisodesandSpecials", "HeyDude", "SaluteYourShorts",
      "AllegrasWindow", "GUTS",
    ] }],
    fallbackPool: ["CaptainN", "Beetlejuice"],
  },
  {
    number: 27, name: "SUNDAY FUNNIES", kind: "curated",
    tagline: "The other Saturday morning (on a Sunday).",
    daypart: [{ days: [0], startHour: 8, endHour: 12, pool: [
      "CaptainN", "Beetlejuice", "GummiBears", "InspectorGadget",
      "HeathcliffandtheCatillacCatsTVSeries", "CattanoogaCatstheSeries",
      "PoliceAcademyTheAnimatedSeries", "EagleRiders", "MightyMousetheNewAdventures",
      "PolePosition", "CampCandy",
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
  { number: 31, name: "USA UP ALL NIGHT", kind: "curated", tagline: "Movies, minus the hosts (mostly).",
    daypart: [], fallbackPool: ["USAUpAllNight"] },
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
    number: 43, name: "SUPERHERO SQUAD", kind: "curated",
    tagline: "Truth, justice, and reruns.",
    daypart: [],
    fallbackPool: ["BatmanTAS", "BatmanBeyond", "XMen", "SpiderManTAS",
      "TeenTitansSeries", "TheMaskAnimatedSeries", "TheTick", "Tick",
      "CaptainPlanet", "PowerRangers", "RoboCopliveactionTVseries"],
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
        "PJs", "BeavisButthead",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 1, pool: [
        "Duckman", "DrawnTogether", "BigMouth", "Oblongs", "HomeMovies",
        "BobandMargaret", "Undergrads", "MoralOrel", "AeonFlux", "Boondocks",
        "PJs", "BeavisButthead",
      ] },
    ],
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

  // -- channels 47-54: built from what the curated lineup above never picked --
  // The genre channels already sweep every show in the catalog, so nothing
  // here is about coverage — these are themed pools drawn from the ~125 shows
  // no curated channel had claimed, which is where the leftovers happened to
  // cluster once they were sorted by era and tone.
  {
    number: 47, name: "MODERN TOONS", kind: "curated",
    tagline: "The cartoons your little brother taped over yours.",
    daypart: [],
    fallbackPool: [
      "SpongeBobSquarePants", "FairlyOddParents", "DextersLaboratorytheSeries",
      "CampLakebottom", "GravityFalls", "Histeria", "KaBlam", "BobbysWorld",
      "AceVenturaPetDetectiveSeries", "ArchiesWeirdMysteries", "BrakShowSeries",
    ],
  },
  {
    number: 48, name: "ACTION TOONS", kind: "curated",
    tagline: "Every vehicle transforms into something.",
    daypart: [],
    fallbackPool: [
      "BikerMiceFromMars", "RamboTheForceofFreedom", "TransformersPrime",
      "SonictheHedgehog", "AdventuresOfSonic", "MutantLeague", "Godzilla",
      "TMNTNextMutation", "SpawntheAnimatedSeriesSeries480x480", "MightyMax",
      "StarcomtheUSSpaceForceSeries", "KarateKid", "MotorcityTVseries",
      "BuzzLightyearofStarCommand", "DuckDodgers",
    ],
  },
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
];
