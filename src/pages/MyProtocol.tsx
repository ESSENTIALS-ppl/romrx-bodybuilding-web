import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { cn } from '../lib/utils'
import {
  AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Circle,
  ClipboardList, Dumbbell, Flame, PersonStanding,
  RefreshCw, CheckCircle, Clock, TrendingUp, BookOpen
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Rx {
  name: string
  dose: string
  cue: string
  equipment: string
  videoUrl?: string
  videoLabel?: string
}
interface Prescription {
  exercises: [Rx, Rx, Rx]
  stretches: [Rx, Rx]
  foam: Rx
}

interface SessionLog {
  sessions: string[]
  cycleStart: string
}

// ── Daily rotation ────────────────────────────────────────────────────────────
const ROTATION: Record<number, number> = {
  1: 0, // Monday    -> Priority 1
  2: 1, // Tuesday   -> Priority 2
  3: 2, // Wednesday -> Priority 3
  4: 0, // Thursday  -> Priority 1
  5: 1, // Friday    -> Priority 2
  6: 2, // Saturday  -> Priority 3
  0: 0, // Sunday    -> Priority 1 (light)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Prescription library ───────────────────────────────────────────────────────
const RX: Record<string, Prescription> = {
  hip_er: {
    exercises: [
      {
        name: 'Clamshell with Band',
        dose: '3 sets x 15-20 reps each side',
        cue: 'Lie on your side with a band just above your knees. Stack your feet on top of each other. Lift your top knee up like a clamshell opening. Keep your hips from rolling back. Squeeze your butt at the top for 2 seconds, then lower slowly.',
        equipment: 'Resistance band',
      },
      {
        name: 'Seated Banded Hip External Rotation',
        dose: '3 sets x 10-12 reps each side',
        cue: 'Sit in a chair. Place a block or rolled towel between your knees. Keep your knees together and swing your foot inward. Your thigh will rotate outward. Hold 2 seconds at the end, then return slowly.',
        equipment: 'Resistance band, yoga block',
      },
      {
        name: 'Standing Hip CARs (Controlled Articular Rotations)',
        dose: '3-5 reps each direction per side, daily',
        cue: 'Stand on one foot. Lift your other knee and draw the biggest, slowest circle you can in the air. Go all the way around, both directions. Move slowly. Switch legs when done.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Supine Figure-4 Stretch (Piriformis)',
        dose: '2-3 sets x hold 30-60 sec each side',
        cue: 'Lie on your back. Cross one ankle over your opposite knee in a figure-4 shape. Grab the back of your bottom thigh and pull it toward your chest. Keep your head on the floor. Hold and breathe.',
        equipment: 'Bodyweight',
      },
      {
        name: '90/90 Hip External Rotation Stretch',
        dose: '1-2 sets x hold 60-90 sec each side',
        cue: 'Sit with your front shin pointing straight across, and your back shin pointing straight back. Sit up tall, then lean your chest forward over your front leg with a straight back. You should feel a deep stretch in your back hip. Hold and breathe slowly.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Piriformis / Glute Foam Roll',
      dose: '60-90 sec per side',
      cue: 'Sit on the foam roller with your right ankle crossed over your left knee. Lean toward the right side so the roller hits your right glute. Roll slowly. When you find a sore spot, stop and hold there for 15-20 seconds. Then move to the next spot.',
      equipment: 'Foam roller',
    },
  },

  hip_ir: {
    exercises: [
      {
        name: 'Seated Banded Hip Internal Rotation',
        dose: '3 sets x 8-12 reps each side',
        cue: 'Sit in a chair. Put a block or folded towel between your knees. Keep your knees together and swing your foot outward. Your thigh will rotate inward. Hold for 5-7 seconds, then relax and repeat.',
        equipment: 'Resistance band, yoga block',
      },
      {
        name: 'Quadruped Band-Assisted Hip IR Mobilization',
        dose: '3 sets x 10 reps each side',
        cue: 'Get on all fours with your hands directly under your shoulders and your knees directly under your hips. Loop a band around one ankle and anchor it to something to the side of you. Start with your knee on the floor and your foot pointing straight up. Slowly let your foot fall outward away from your body as far as it will comfortably go. Hold that position for 2 seconds. Then push your foot back inward toward center, pressing against the band for 5 seconds as if trying to fight it back. Release and let the foot fall out again. Repeat on the same side for all reps, then switch legs.',
        equipment: 'Resistance band',
      },
      {
        name: '90/90 Hip Switches',
        dose: '8-10 transitions, daily warm-up',
        cue: 'Sit on the floor in a 90/90 position, both knees bent. Lift both knees slightly off the floor and rotate your hips to one side, lowering both knees to the floor. Then lift again and rotate to the other side. Keep the movement controlled, not sloppy.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: '90/90 Internal Rotation Stretch',
        dose: '2-3 sets x hold 30-60 sec each side',
        cue: 'Sit in a 90/90 position. Lean your weight toward your back leg. Gently press your back knee toward the floor. The stretch comes from your hip, not your back. Hold and breathe. Switch sides.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Prone Hip IR Gravity Stretch',
        dose: '1-2 sets x hold 60 sec',
        cue: 'Lie face down. Bend both knees to 90 degrees so your feet point up. Let your feet fall outward toward the floor. Press your hip bones into the mat. Do not force it. Just breathe and let gravity pull your feet down over time.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'TFL / Lateral Hip Foam Roll',
      dose: '60-90 sec per side',
      cue: 'Lie on your side with the roller under the side of your hip, between your hip bone and the top of your thigh. Slowly rock forward and back a little to find the tender spots. When you find one, stop and hold there.',
      equipment: 'Foam roller',
    },
  },

  hip_abd: {
    exercises: [
      {
        name: 'Side-Lying Hip Abduction with Band',
        dose: '3 sets x 15 reps each side',
        cue: 'Lie on your side. Keep your foot flexed and lead with your heel as you lift your top leg straight up. Your hips should not roll backward at all. If they do, you went too high. Lower slowly.',
        equipment: 'Resistance band',
      },
      {
        name: 'Lateral Band Walks',
        dose: '3 sets x 10-15 steps each direction',
        cue: 'Put a band just above your knees and stand with your feet hip-width apart. Bend your knees slightly like you are starting to sit down. Step sideways one foot at a time, keeping the band tight. Do not let your knees cave toward each other.',
        equipment: 'Resistance band',
      },
      {
        name: 'Goblet Squat Wide Stance (Pause at Bottom)',
        dose: '3 sets x 8 reps with 3-sec pause',
        cue: 'Hold a weight at your chest and stand with feet wide. Squat down as deep as you can with your heels flat. At the bottom, use your elbows to push your knees apart. Hold 3 seconds, then stand back up.',
        equipment: 'Kettlebell',
      },
    ],
    stretches: [
      {
        name: 'Frog Stretch',
        dose: '2-3 sets x hold 45-60 sec',
        cue: 'Get on all fours and spread your knees wide apart. Keep your feet flat on the floor behind your knees. Lower down to your elbows. Slowly push your hips backward to deepen the stretch. Hold and breathe.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Standing Side Lunge Adductor Stretch',
        dose: '2-3 sets x hold 30 sec each side',
        cue: 'Stand with your feet very wide apart. Bend one knee and shift your weight to that side. Keep your other leg straight with its foot flat on the floor. You should feel a stretch along the inside of your straight leg. Hold and switch.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Adductor (Inner Thigh) Foam Roll',
      dose: '60-90 sec per side',
      cue: 'Lie face down. Bend one leg out to the side so your knee is wide and your inner thigh is on the roller. Roll slowly from your groin area down toward your knee. When you find a sore spot, stop and hold there for 30 seconds.',
      equipment: 'Foam roller',
    },
  },

  hip_flex: {
    exercises: [
      {
        name: 'Goblet Squat with Pause at Bottom',
        dose: '3 sets x 8 reps, 3-5 sec pause',
        cue: 'Hold a weight at your chest. Squat down as deep as you can with your heels flat. At the bottom, stay there and take 3-5 slow breaths. Then stand back up. Do not bounce out of the bottom.',
        equipment: 'Kettlebell',
      },
      {
        name: '90/90 Front Leg Hip Flexor Hold',
        dose: '3 sets x 8-10 reps each side',
        cue: 'Sit on the floor in a 90/90 position. Without using your hands, lift your front foot 1-2 inches off the floor by tightening the muscle at the front of your hip. Hold for 5 seconds. Lower slowly. If this is hard, that is normal. Keep trying.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Standing Knee Drive with Band',
        dose: '3 sets x 12-15 reps each side',
        cue: 'Tie or anchor a band behind you and loop it around your ankle. Stand up straight and drive your knee upward as high as you can. Hold briefly at the top, then lower slowly. The muscle working is deep in your hip and stomach area.',
        equipment: 'Resistance band',
      },
    ],
    stretches: [
      {
        name: 'Kneeling Hip Flexor Lunge Stretch',
        dose: '2-3 sets x hold 30-60 sec each side',
        cue: 'Kneel on one knee with your other foot forward. Squeeze your back glute and tuck your hips under to flatten your low back. Then slowly shift your hips forward without letting your low back arch. Hold. You should feel a stretch at the front of your back hip.',
        equipment: 'Pad / mat',
      },
      {
        name: 'Supine Knee-to-Chest Stretch',
        dose: '2 sets x hold 30-60 sec each side',
        cue: 'Lie on your back. Pull one knee toward your chest with both hands. Keep your lower back flat on the floor. The other leg stays straight. Breathe slowly and let the stretch deepen with each exhale.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Quadriceps / Rectus Femoris Foam Roll',
      dose: '60-90 sec per leg',
      cue: 'Lie face down with the roller under the front of one thigh. Use your arms to slowly roll from your hip crease down to just above your knee. When you find a sore spot, stop there and slowly bend and straighten your knee a few times.',
      equipment: 'Foam roller',
    },
  },

  shoulder_er: {
    exercises: [
      {
        name: 'Side-Lying Shoulder External Rotation',
        dose: '3 sets x 12-15 reps each side',
        cue: 'Lie on your side. Place a rolled towel under your top arm to keep it level. Keep your elbow touching your side and bend your elbow to 90 degrees. Rotate your forearm upward as far as it will go. Lower slowly. Keep the movement small and controlled.',
        equipment: 'Resistance band',
      },
      {
        name: 'Band Face Pull with External Rotation',
        dose: '3 sets x 12-15 reps',
        cue: 'Hold a band in front of you at eye level. Pull it toward your face while rotating your hands so your thumbs point behind you. Finish with your hands beside your ears. Squeeze your shoulder blades together at the end. Hold 1 second, then return.',
        equipment: 'Resistance band',
      },
      {
        name: 'Prone Y Raise',
        dose: '3 sets x 10-12 reps, hold 5-7 sec at top',
        cue: 'Lie face down with your arms out in a Y shape above your head, thumbs pointing up. Lift your arms off the floor by squeezing your shoulder blades together and down. Hold 5-7 seconds at the top. Lower slowly.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Doorway Pec Stretch',
        dose: '3-5 sets, hold 30 sec each time (aim for 150 total seconds)',
        cue: 'Stand in a doorway. Place your right forearm against the right side of the door frame with your elbow bent to 90 degrees and your upper arm at shoulder height, making an L shape with your arm. Step your right foot slightly forward. Lean your whole body through the doorway until you feel a stretch across the front of your right shoulder and chest. Hold and breathe. Move your arm slightly higher or lower on the door frame to find different parts of the stretch. Switch sides. Research shows that 150 total seconds of this stretch can add up to 6 degrees of improved shoulder rotation.',
        equipment: 'Doorway',
      },
      {
        name: 'Sleeper Stretch',
        dose: '2-3 sets x hold 30-45 sec each side',
        cue: 'Lie on your right side. Stretch your right arm out in front of you at shoulder height, bent to 90 degrees so your forearm points up toward the ceiling. This is the arm being stretched. Use your left hand to gently press your right forearm downward toward the floor in front of you. You should feel a mild stretch in the back of your right shoulder. Keep your right shoulder from rolling forward off the floor. If your shoulder comes off the floor, you are pressing too hard. Hold and breathe. Switch to the other side.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Posterior Shoulder Release (Lacrosse Ball)',
      dose: '60-90 sec per side',
      cue: 'Lie on your back. Place a lacrosse ball or firm massage ball on the floor. Position it on the back of your shoulder, in the meaty area between your shoulder blade and the back of your shoulder joint. Slowly roll your body weight onto the ball so it presses into that area. Make small arm circles or slowly move your arm up and down while pressing into the ball. When you find a spot that is especially sore, stop moving and just hold on that spot for 30-45 seconds. Then move the ball to a new spot. Do the full time on one side, then switch.',
      equipment: 'Lacrosse ball or firm ball',
    },
  },

  shoulder_flex: {
    exercises: [
      {
        name: 'Wall Slide (Forearm Version)',
        dose: '3 sets x 10-12 reps',
        cue: 'Stand with your back flat against a wall. Bend your elbows to 90 degrees and press both elbows, forearms, and the backs of your hands against the wall. Start in a field goal position with your elbows at shoulder height and upper arms out to the sides. From there, slowly slide both arms straight UP the wall as high as you can go while keeping your elbows, forearms, and hands all touching the wall. Then slide back down. If your lower back arches away from the wall or your hands lose contact, you went too far. Do not shrug your shoulders toward your ears at any point.',
        equipment: 'Bodyweight / wall',
      },
      {
        name: 'Prone Y Raise',
        dose: '3 sets x 10-12 reps, hold 5-7 sec at top',
        cue: 'Lie face down with your forehead resting on the floor or a folded towel. Stretch both arms out above your head so your body makes a Y shape. Turn your thumbs toward the ceiling. Lift both arms off the floor at the same time by squeezing your shoulder blades toward each other and toward your lower back. Lift only as high as you can without your shoulders creeping up toward your ears. Hold 5-7 seconds at the top, then lower slowly. This is a small movement, not a big lift.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Kettlebell Arm Bar',
        dose: '3 sets x hold 20-30 sec each side',
        cue: 'Lie on your back holding a light kettlebell in one hand with your arm pointing straight up toward the ceiling. Bend the same knee so that foot is flat on the floor. Slowly roll toward the side of the kettlebell by letting that bent knee cross over your body toward the floor. Keep your arm completely straight and the kettlebell pointing at the ceiling the whole time. Your shoulder should stay pressed down and away from your ear at all times. Hold the stretched position and breathe slowly. Return your knee to starting position, then switch sides.',
        equipment: 'Light kettlebell',
      },
    ],
    stretches: [
      {
        name: "Child's Pose Lat Stretch",
        dose: '2-3 sets x hold 45-60 sec',
        cue: 'Get on all fours, then sit your hips back toward your heels while keeping your arms stretched out on the floor. Walk both hands to one side to feel the stretch more in that side of your back. Hold and breathe.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Overhead Band Distraction Stretch',
        dose: '2-3 sets x hold 30-45 sec each side',
        cue: 'Hook a band high on a door or rack. Loop it around your wrist and step away until you feel your shoulder being gently pulled upward. Let your arm hang, breathe, and relax into the stretch.',
        equipment: 'Resistance band',
      },
    ],
    foam: {
      name: 'Thoracic Spine Foam Roll with Arms Overhead',
      dose: '60-90 sec, segment by segment',
      cue: 'Sit on the floor and place the foam roller across your mid-upper back. Cross your arms over your chest or put your hands behind your head. Lean back over the roller slowly, moving just 1 inch at a time. Pause at any spot that feels stiff or sore.',
      equipment: 'Foam roller',
    },
  },

  ankle_df: {
    exercises: [
      {
        name: 'Banded Ankle Dorsiflexion Mobilization',
        dose: '3 sets x 10-15 reps each side',
        cue: 'Tie a band around your ankle and anchor it behind you. Get into a lunge position with your front foot close to a wall. Drive your front knee forward toward the wall while keeping your heel flat on the floor. The band helps open up the ankle joint.',
        equipment: 'Resistance band',
      },
      {
        name: 'Eccentric Calf Raises (Off Step)',
        dose: '3 sets x 12-15 reps each side',
        cue: 'Stand on the edge of a step with the balls of your feet. Rise up on both feet together. Then lower back down slowly on just one foot. Let your heel drop below the step level at the bottom. The slow lowering is the important part.',
        equipment: 'Step / stairs',
      },
      {
        name: 'Deep Squat Hold (Heel Elevated if Needed)',
        dose: '3 x 60 sec daily',
        cue: 'Squat all the way down with your feet flat or slightly elevated if needed. Hold the bottom position with your chest up and knees pushed out. Each week, try to lower the heel elevation a little until you can do it with flat feet.',
        equipment: 'Bodyweight (small plate under heels if needed)',
      },
    ],
    stretches: [
      {
        name: 'Wall Ankle DF Stretch (Knee Over Toe)',
        dose: '2-3 sets x hold 30-45 sec each side',
        cue: 'Stand facing a wall. Place your toes close to the wall and try to touch your knee to the wall without letting your heel lift. If it is easy, move your foot back a bit. Keep moving it back until you find where it is just barely possible with your heel flat.',
        equipment: 'Bodyweight / wall',
      },
      {
        name: "Runner's Calf Stretch (Straight + Bent Knee)",
        dose: '2 sets each variation x hold 30 sec each side',
        cue: 'Stand facing a wall with one foot back. Press your heel flat and lean toward the wall. Do this first with a straight back leg, then with a slightly bent back leg. Both positions stretch different muscles in your calf. Do both versions.',
        equipment: 'Bodyweight / wall',
      },
    ],
    foam: {
      name: 'Calf / Gastrocnemius Foam Roll',
      dose: '60-90 sec per leg',
      cue: 'Sit on the floor and place the roller under one calf. Cross your other leg on top to add weight. Lift your hips and use your arms to roll slowly from your ankle up to your knee. Stop and hold wherever it feels sore.',
      equipment: 'Foam roller',
    },
  },

  lumbar: {
    exercises: [
      {
        name: 'Cat-Cow (Segmental Lumbar Mobilization)',
        dose: '3 sets x 10 slow reps, daily',
        cue: 'Get on all fours with your hands under your shoulders and knees under your hips. Slowly arch your back up toward the ceiling like a scared cat, then let it sag down like a cow. Do this slowly and try to feel each section of your spine move. Do not rush.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Bird Dog (Opposite Arm/Leg)',
        dose: '3 sets x 10 reps each side, hold 3 sec',
        cue: 'Get on all fours. Tighten your stomach slightly. Slowly reach one arm straight forward and the opposite leg straight back at the same time. Keep your back flat the whole time. Hold 3 seconds, then switch sides. If your hips twist or rock, slow down.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Deadbug',
        dose: '3 sets x 8 reps each side',
        cue: 'Lie on your back with your arms out to the sides. Press your lower back firmly into the floor. Slowly lower one arm overhead and the opposite leg toward the floor at the same time without letting your back arch. Bring them back up and switch sides.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Supine Knees-to-Chest Lumbar Decompression',
        dose: '2-3 sets x hold 60 sec',
        cue: 'Lie on your back and pull both knees toward your chest. Keep your lower back pressed gently into the floor. Rock slowly side to side. Hold and breathe, letting your lower back fully relax.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Cobra / Press-Up (Lumbar Extension Mob)',
        dose: '3 sets x 10 press-ups',
        cue: 'Lie face down with your hands under your shoulders. Press up through your arms while letting your hips and lower body stay on the floor. Do not force it. Let your back sag and relax into the position. Hold briefly, then lower.',
        equipment: 'Bodyweight / mat',
      },
    ],
    foam: {
      name: 'Thoracic + Lumbar Junction Foam Roll',
      dose: '60-90 sec, working T12-L2 area',
      cue: 'Sit on the floor and place the roller across your lower-mid back. Cross your arms over your chest. Let your body hang back gently over the roller. Breathe in deeply, then exhale and let your back relax over it. Move up or down 1 inch at a time.',
      equipment: 'Foam roller',
    },
  },

  cervical_rot: {
    exercises: [
      {
        name: 'Cervical CARs (Controlled Articular Rotations)',
        dose: '3-5 reps each direction, daily',
        cue: 'Sit up straight. Move your head in the biggest, slowest circle you can. Go as far as it will comfortably go in every direction. Pause and breathe at the farthest point before continuing the circle. Do 3-5 circles each direction.',
        equipment: 'Bodyweight',
      },
      {
        name: 'SCM Strengthening (Isometric Side Resistance)',
        dose: '3 sets x 5 reps, hold 10 sec each side',
        cue: 'Sit up straight. Place your hand against the side of your head above your ear. Try to turn your head to that side, but use your hand to stop it from moving. Push for 10 seconds, then relax. Do this on both sides.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Deep Neck Flexor Chin Tuck',
        dose: '3 sets x 10 reps, hold 5 sec',
        cue: 'Sit up straight. Gently pull your head straight back like you are making a double chin. Do not tilt your head up or down. Just pull it straight back. Hold 5 seconds. This strengthens the small muscles at the front of your neck.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Lateral Neck Stretch (SCM / Scalene)',
        dose: '2-3 sets x hold 30-45 sec each side',
        cue: 'Sit up straight. Slowly tilt your ear toward your shoulder on the same side. Do not rotate your head. Use your other hand to gently pull down on the opposite shoulder to increase the stretch. Hold and breathe.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Suboccipital Release Stretch',
        dose: '2 sets x hold 45 sec',
        cue: 'First, pull your head straight back to make a double chin. From that position, slowly nod your chin down toward your chest. Lace your fingers behind your head and add a very gentle downward pressure. Hold and breathe.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Suboccipital Release (Tennis Ball / Small Ball)',
      dose: '60-90 sec',
      cue: 'Tape two tennis balls together or use a small firm ball. Lie on your back and place the balls at the base of your skull where your head meets your neck. Gently nod yes and shake no in tiny movements. Stay on any sore spots for 20-30 seconds.',
      equipment: 'Two tennis balls or massage ball',
    },
  },

  thoracic_rot: {
    exercises: [
      {
        name: 'Open Books (Side-Lying Thoracic Rotation)',
        dose: '3 sets x 10 reps each side',
        cue: 'Lie on your side with your knees bent and stacked. Stretch both arms in front of you. Keep your knees together and hips still. Sweep your top arm up toward the ceiling and then all the way to the floor on the other side. Follow your hand with your eyes. Breathe into the rotation.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Thread-the-Needle',
        dose: '3 sets x 8 reps each side, hold 3 sec at end',
        cue: 'Get on all fours. Slide one arm across the floor under your body until your shoulder and the side of your head touch the floor. Keep your hips level and your other arm straight. Hold 3 seconds, then pull the arm back out and repeat.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Seated Thoracic Rotation with Stick',
        dose: '3 sets x 10 reps each side',
        cue: 'Sit up straight in a chair with a stick or broomstick resting across your shoulders behind your neck. Hold each end lightly. Rotate your upper body to one side as far as you can without letting your hips turn. Come back and rotate the other way.',
        equipment: 'PVC pipe or broomstick',
      },
    ],
    stretches: [
      {
        name: 'Quadruped Thoracic Rotation Stretch',
        dose: '2-3 sets x hold 30 sec each side',
        cue: 'Get on all fours. Put one hand behind your head. Rotate your elbow upward toward the ceiling as far as it will go. Your hips should stay still throughout. Hold 30 seconds at the top, then lower and switch sides.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Foam Roller Thoracic Extension + Rotation',
        dose: '60 sec per side',
        cue: 'Sit with the foam roller across your mid-back and lie back over it. Place your hands behind your head. To add rotation, drop one knee to the floor so your body twists slightly to that side. Hold 30-60 seconds, then switch.',
        equipment: 'Foam roller',
      },
    ],
    foam: {
      name: 'Thoracic Spine Foam Roll (Segmental)',
      dose: '90 sec, segment by segment T4-T10',
      cue: 'Sit on the floor with the foam roller across your mid-back. Cross your arms over your chest. Slowly lean back over the roller. Move just 1 inch at a time, from the middle of your back up toward your shoulders. Take a breath at each position before moving to the next.',
      equipment: 'Foam roller',
    },
  },
}

// ── Joint config ──────────────────────────────────────────────────────────────
interface JointDef {
  key: string
  label: string
  bjjWhy: string
  leftKey?: string
  rightKey?: string
  singleKey?: string
  normalMin: number
  normalMax: number
  riskBelow: number
  unit: string
  rxKey: string
}

const JOINTS: JointDef[] = [
  {
    key: 'hip_er', label: 'Hip External Rotation',
    bjjWhy: 'Triangles, De La Riva guard, seated guard mobility',
    leftKey: 'hip_er_l', rightKey: 'hip_er_r',
    normalMin: 40, normalMax: 60, riskBelow: 40, unit: '°', rxKey: 'hip_er',
  },
  {
    key: 'hip_ir', label: 'Hip Internal Rotation',
    bjjWhy: 'Guard passing, knee cuts, hip switches in scrambles',
    leftKey: 'hip_ir_l', rightKey: 'hip_ir_r',
    normalMin: 30, normalMax: 45, riskBelow: 30, unit: '°', rxKey: 'hip_ir',
  },
  {
    key: 'hip_abd', label: 'Hip Abduction',
    bjjWhy: 'Mount stability, open guard hooks, wide base positions',
    leftKey: 'hip_abd_l', rightKey: 'hip_abd_r',
    normalMin: 40, normalMax: 50, riskBelow: 30, unit: '°', rxKey: 'hip_abd',
  },
  {
    key: 'hip_flex', label: 'Hip Flexion',
    bjjWhy: 'Closed guard, armbar mechanics, guard retention',
    leftKey: 'hip_flex_l', rightKey: 'hip_flex_r',
    normalMin: 100, normalMax: 120, riskBelow: 100, unit: '°', rxKey: 'hip_flex',
  },
  {
    key: 'shoulder_er', label: 'Shoulder External Rotation',
    bjjWhy: 'Defending Americana / Kimura, grip fighting, frames',
    leftKey: 'shoulder_er_l', rightKey: 'shoulder_er_r',
    normalMin: 60, normalMax: 90, riskBelow: 60, unit: '°', rxKey: 'shoulder_er',
  },
  {
    key: 'shoulder_flex', label: 'Shoulder Flexion',
    bjjWhy: 'Spider guard, overhead sweeps, rear naked choke mechanics',
    leftKey: 'shoulder_flex_l', rightKey: 'shoulder_flex_r',
    normalMin: 140, normalMax: 180, riskBelow: 120, unit: '°', rxKey: 'shoulder_flex',
  },
  {
    key: 'ankle_df', label: 'Ankle Dorsiflexion',
    bjjWhy: 'Base, balance, and proprioception in every standing position',
    leftKey: 'ankle_df_l', rightKey: 'ankle_df_r',
    normalMin: 10, normalMax: 20, riskBelow: 10, unit: 'cm', rxKey: 'ankle_df',
  },
  {
    key: 'cervical_rot', label: 'Cervical Rotation',
    bjjWhy: 'Awareness, safety, and avoiding neck injury in scrambles',
    leftKey: 'cervical_rot_l', rightKey: 'cervical_rot_r',
    normalMin: 70, normalMax: 90, riskBelow: 60, unit: '°', rxKey: 'cervical_rot',
  },
  {
    key: 'lumbar', label: 'Lumbar Spine',
    bjjWhy: 'Bridging, guard recovery, turtle position, back escapes',
    singleKey: 'lumbar_flex',
    normalMin: 40, normalMax: 80, riskBelow: 40, unit: '°', rxKey: 'lumbar',
  },
  {
    key: 'thoracic_rot', label: 'Thoracic Rotation',
    bjjWhy: 'Hip escapes, guard recovery, back take entries',
    singleKey: 'thoracic_rot',
    normalMin: 40, normalMax: 60, riskBelow: 30, unit: '°', rxKey: 'thoracic_rot',
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────────
interface ScoredJoint {
  def: JointDef
  left: number | null
  right: number | null
  single: number | null
  asymmetry: number
  severity: number
  atRisk: boolean
  gap: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreJoints(assessment: Record<string, any>): ScoredJoint[] {
  return JOINTS.map(def => {
    const left   = def.leftKey   ? (assessment[def.leftKey]  ?? null) : null
    const right  = def.rightKey  ? (assessment[def.rightKey] ?? null) : null
    const single = def.singleKey ? (assessment[def.singleKey] ?? null) : null

    let asymmetry = 0
    let severity  = 0
    let atRisk    = false
    let gap       = ''

    if (left !== null && right !== null) {
      asymmetry = Math.abs(left - right)
      const worst = Math.min(left, right)
      severity = Math.max(0, def.normalMin - worst)
      atRisk   = worst < def.riskBelow
      const { unit } = def
      gap = `L ${left}${unit}  vs  R ${right}${unit}  ·  ${asymmetry}${unit} gap`
    } else if (single !== null) {
      severity = Math.max(0, def.normalMin - single)
      atRisk   = single < def.riskBelow
      gap = `${single}${def.unit}  (normal >= ${def.normalMin}${def.unit})`
    }

    return { def, left, right, single, asymmetry, severity, atRisk, gap }
  })
}

// ── Retest status banner ──────────────────────────────────────────────────────
function RetestBanner({ assessedAt }: { assessedAt: string }) {
  const navigate = useNavigate()
  const now = new Date()
  const assessed = new Date(assessedAt)
  const daysSince = Math.floor((now.getTime() - assessed.getTime()) / (1000 * 60 * 60 * 24))
  const weeksSince = daysSince / 7

  const retestDate = new Date(assessed.getTime() + 42 * 24 * 60 * 60 * 1000)
  const daysUntilRetest = Math.ceil((retestDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const retestDateStr = retestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const assessedDateStr = assessed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  let status: 'green' | 'yellow' | 'red'
  let Icon: React.ElementType
  let message: string
  let subtext: string

  if (weeksSince < 4) {
    status = 'green'
    Icon = CheckCircle
    message = `Assessed ${assessedDateStr}`
    subtext = `Next retest in ${daysUntilRetest} days · ${retestDateStr}`
  } else if (weeksSince < 6) {
    status = 'yellow'
    Icon = Clock
    message = `Reassessment due ${retestDateStr}`
    subtext = 'Your ROM may have shifted -- retest to update your protocol and unlock new techniques'
  } else {
    status = 'red'
    Icon = RefreshCw
    message = `Retest overdue by ${Math.abs(daysUntilRetest)} days`
    subtext = "Retake now to see how much you've improved and update your technique ratings"
  }

  const styles = {
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-tier-bg border-yellow-200 text-yellow-tier',
    red: 'bg-red-tier-bg border-red-tier/30 text-red-tier',
  }
  const iconStyles = {
    green: 'text-green-600',
    yellow: 'text-yellow-tier',
    red: 'text-red-tier',
  }

  return (
    <button
      onClick={() => navigate('/onboarding/assessment')}
      className={cn(
        'w-full flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-opacity hover:opacity-80',
        styles[status]
      )}
    >
      <Icon className={cn('shrink-0 mt-0.5', iconStyles[status])} size={16} />
      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug">{message}</p>
        <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{subtext}</p>
      </div>
      <span className="ml-auto shrink-0 text-xs font-semibold underline underline-offset-2 opacity-70 mt-0.5">Retest</span>
    </button>
  )
}

// ── Why Statement card ────────────────────────────────────────────────────────
function WhyStatement() {
  return (
    <div className="rounded-2xl border border-miami/40 p-5" style={{ backgroundColor: '#36454F' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-miami mb-3">
        WHY YOUR Rx IS BUILT THIS WAY
      </p>
      <p className="text-sm text-white/90 leading-relaxed">
        9 out of 10 lifters get hurt, and most of those injuries happen in practice, not competition. The people who keep showing up for decades all share the same thing: both sides of their body move the same way. When one side is tighter than the other, your injury risk jumps by up to 30%. Most people train until their body stops letting them. We built this so you become someone who never has to quit.
      </p>
      <p className="mt-3 text-[10px] text-miami leading-relaxed">
        Research:{' '}
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6745816/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Petrisor et al. (OJSM 2019)
        </a>
        {' · '}
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5294948/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Lima et al. (2017)
        </a>
        {' · '}
        <a
          href="https://link.springer.com/10.1186/s13102-025-01465-z"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Zhou &amp; Liu (2025)
        </a>
        {' · '}
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10980866/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Konrad et al. (JSHS 2023)
        </a>
      </p>
    </div>
  )
}

// ── Today Card ────────────────────────────────────────────────────────────────
function TodayMovementCard({ rx, index }: { rx: Rx; index: number }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)

  const labels = ['Movement 1', 'Movement 2', 'Movement 3']

  return (
    <div className={cn(
      'rounded-xl border transition-colors overflow-hidden',
      checked ? 'border-miami/20 bg-miami/[0.03]' : 'border-miami-light bg-white'
    )}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <button
          onClick={() => setChecked(c => !c)}
          className="mt-0.5 shrink-0 text-miami hover:scale-110 transition-transform"
        >
          {checked
            ? <CheckCircle2 size={17} fill="currentColor" strokeWidth={0} />
            : <Circle size={17} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] text-miami font-bold uppercase tracking-wider mb-0.5">{labels[index]}</p>
              <p className={cn('text-sm font-semibold leading-snug', checked ? 'line-through text-charcoal-light' : 'text-charcoal')}>
                {rx.name}
              </p>
            </div>
            <button
              onClick={() => setOpen(o => !o)}
              className="text-charcoal-light hover:text-miami transition-colors mt-0.5 shrink-0"
            >
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          <span className="inline-block text-xs bg-miami-light text-miami font-semibold px-2.5 py-0.5 rounded-full mt-1.5">
            {rx.dose}
          </span>
          {open && (
            <div className="mt-2.5 pt-2.5 border-t border-miami-light space-y-2">
              <p className="text-xs text-charcoal-light leading-relaxed">
                <span className="font-semibold text-charcoal">Coaching cue: </span>{rx.cue}
              </p>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TodayCardProps {
  ranked: ScoredJoint[]
  assessedAt: string
  userId: string
}

function TodayCard({ ranked, assessedAt, userId }: TodayCardProps) {
  const todayDow = new Date().getDay()
  const todayPriorityIndex = ROTATION[todayDow]
  const todayPriority = ranked[Math.min(todayPriorityIndex, ranked.length - 1)]
  const dayName = DAY_NAMES[todayDow]

  const storageKey = `romrx_sessions_${userId}`

  const getLog = useCallback((): SessionLog => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as SessionLog
    } catch { /* ignore */ }
    return { sessions: [], cycleStart: assessedAt }
  }, [storageKey, assessedAt])

  const [log, setLog] = useState<SessionLog>(getLog)
  const [completedToday, setCompletedToday] = useState(false)
  // DB-authoritative session count (matches what coach sees)
  const [dbSessionCount, setDbSessionCount] = useState(0)

  const cycleStart = log.cycleStart || assessedAt
  const cycleStartDate = cycleStart.slice(0, 10)

  // Load session count from DB on mount and keep in sync
  useEffect(() => {
    if (!userId) return
    supabase
      .from('protocol_sessions')
      .select('session_date', { count: 'exact' })
      .eq('user_id', userId)
      .gte('session_date', cycleStartDate)
      .then(({ count }) => { if (count !== null) setDbSessionCount(count) })
  }, [userId, cycleStartDate])

  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    setCompletedToday(log.sessions.includes(todayIso))
  }, [log])

  const handleMarkComplete = useCallback(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const protocolDay = `P${todayPriorityIndex + 1}`
    setLog(prev => {
      const sessions = prev.sessions.includes(todayIso)
        ? prev.sessions
        : [...prev.sessions, todayIso]
      const next: SessionLog = { ...prev, sessions }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    setCompletedToday(true)
    // Log to DB (authoritative source for coach + athlete counts)
    supabase.from('protocol_sessions').upsert({
      user_id: userId,
      session_date: todayIso,
      protocol_day: protocolDay,
    }, { onConflict: 'user_id,session_date' }).then(({ error }) => {
      if (!error) {
        // Update display count from DB after successful write
        setDbSessionCount(prev => {
          // Only increment if this is a new day (upsert on same day = same count)
          const todayCounted = log.sessions.includes(todayIso)
          return todayCounted ? prev : prev + 1
        })
      }
    })
  }, [storageKey, userId, todayPriorityIndex, log])

  const sessionsThisCycle = dbSessionCount  // Use DB count (matches coach view)
  const progressPct = Math.min(100, Math.round((sessionsThisCycle / 36) * 100))

  const now = new Date()
  const retestDate = new Date(new Date(assessedAt).getTime() + 42 * 24 * 60 * 60 * 1000)
  const daysUntilRetest = Math.ceil((retestDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const retestDateStr = retestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const rx = todayPriority ? RX[todayPriority.def.rxKey] : null
  const todayMovements: Rx[] = rx
    ? [rx.exercises[0], rx.stretches[0], rx.foam]
    : []

  return (
    <div className="rounded-2xl border-2 border-miami bg-white shadow-md overflow-hidden">
      {/* Header row */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-miami">TODAY &middot; {dayName.toUpperCase()}</p>
            <h2 className="font-display font-bold text-charcoal text-xl leading-tight mt-0.5">
              {todayPriority ? todayPriority.def.label : 'Recovery Day'}
            </h2>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-charcoal-light uppercase tracking-wide">Session</p>
            <p className="text-lg font-bold text-miami leading-tight">{sessionsThisCycle}<span className="text-sm font-normal text-charcoal-light">/36</span></p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 mb-2">
          <div className="w-full bg-miami-light rounded-full h-2">
            <div
              className="bg-miami h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Retest line */}
        <div className="flex items-center gap-1.5 text-xs text-charcoal-light">
          <TrendingUp size={11} className="text-miami shrink-0" />
          {daysUntilRetest > 0
            ? <span>Retest in <strong className="text-charcoal">{daysUntilRetest} days</strong> &middot; {retestDateStr}</span>
            : <span className="text-red-tier font-semibold">Retest due</span>
          }
        </div>
      </div>

      {/* Movements */}
      {todayMovements.length > 0 && (
        <div className="px-5 pb-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-charcoal-light mb-2">Today's movements</p>
          {todayMovements.map((m, i) => (
            <TodayMovementCard key={i} rx={m} index={i} />
          ))}
        </div>
      )}

      {/* Mark complete button */}
      <div className="px-5 pb-5">
        {completedToday ? (
          <div className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-50 border border-green-200 py-3.5 text-green-700 font-semibold text-sm">
            <CheckCircle2 size={16} fill="currentColor" strokeWidth={0} />
            Completed today
          </div>
        ) : (
          <button
            onClick={handleMarkComplete}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-charcoal transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: '#D4AF37' }}
          >
            Mark Today Complete
          </button>
        )}
      </div>
    </div>
  )
}

// ── Full protocol Rx item ─────────────────────────────────────────────────────
function RxItem({
  label, icon: Icon, color, items,
}: {
  label: string
  icon: React.ElementType
  color: string
  items: Rx[]
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false))

  const toggle = (i: number) => setOpenIdx(o => o === i ? null : i)
  const check  = (i: number) => setChecked(c => c.map((v, idx) => idx === i ? !v : v))

  return (
    <div>
      <div className={cn('flex items-center gap-2 mb-2.5', color)}>
        <Icon size={14} className="shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="space-y-2">
        {items.map((rx, i) => (
          <div key={i} className={cn(
            'rounded-xl border transition-colors overflow-hidden',
            checked[i] ? 'border-miami/20 bg-miami/[0.03]' : 'border-miami-light bg-white'
          )}>
            <div className="flex items-start gap-3 px-3.5 py-3">
              <button onClick={() => check(i)} className="mt-0.5 shrink-0 text-miami hover:scale-110 transition-transform">
                {checked[i]
                  ? <CheckCircle2 size={17} fill="currentColor" strokeWidth={0} />
                  : <Circle size={17} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold leading-snug', checked[i] ? 'line-through text-charcoal-light' : 'text-charcoal')}>
                    {rx.name}
                  </p>
                  <button onClick={() => toggle(i)} className="text-charcoal-light hover:text-miami transition-colors mt-0.5 shrink-0">
                    {openIdx === i ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-xs bg-miami-light text-miami font-semibold px-2.5 py-0.5 rounded-full">{rx.dose}</span>
                  {rx.equipment && rx.equipment !== 'Bodyweight' && (
                    <span className="text-xs bg-surface text-charcoal-light px-2.5 py-0.5 rounded-full">{rx.equipment}</span>
                  )}
                </div>
                {openIdx === i && (
                  <div className="mt-2.5 pt-2.5 border-t border-miami-light space-y-2">
                    <p className="text-xs text-charcoal-light leading-relaxed">
                      <span className="font-semibold text-charcoal">Coaching cue: </span>{rx.cue}
                    </p>

                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IssueCard({ ranked, rank }: { ranked: ScoredJoint; rank: number }) {
  const [open, setOpen] = useState(rank === 1)
  const { def, left, right, single, atRisk, asymmetry, severity } = ranked
  const rx = RX[def.rxKey]

  const rankLabel = rank === 1 ? '#1 Priority' : rank === 2 ? '#2 Priority' : '#3 Priority'
  const rankColor = rank === 1 ? 'bg-red-tier text-white' : rank === 2 ? 'bg-yellow-tier text-white' : 'bg-miami text-white'

  const hasAsymmetry = left !== null && right !== null && asymmetry > 0

  return (
    <div className="bg-white rounded-2xl border border-miami-light shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
      >
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', rankColor)}>
                {rankLabel}
              </span>
              {atRisk && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-tier bg-red-tier-bg px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <AlertTriangle size={9} /> AT RISK
                </span>
              )}
            </div>
            <h3 className="font-display font-bold text-charcoal text-base leading-snug">{def.label}</h3>
            <p className="text-xs text-charcoal-light mt-0.5">{def.bjjWhy}</p>
          </div>
          <div className="shrink-0 text-charcoal-light mt-1">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-5 pb-4 flex flex-wrap gap-3">
          {hasAsymmetry ? (
            <>
              <div className="bg-surface rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Left</p>
                <p className={cn('text-sm font-bold', (left ?? 0) < def.riskBelow ? 'text-red-tier' : (left ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-miami')}>
                  {left}{def.unit}
                </p>
              </div>
              <div className="bg-surface rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Right</p>
                <p className={cn('text-sm font-bold', (right ?? 0) < def.riskBelow ? 'text-red-tier' : (right ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-miami')}>
                  {right}{def.unit}
                </p>
              </div>
              <div className="bg-yellow-tier-bg rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-yellow-tier font-bold uppercase tracking-wide">Asymmetry</p>
                <p className="text-sm font-bold text-yellow-tier">{asymmetry}{def.unit} gap</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-surface rounded-xl px-3 py-1.5">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Value</p>
                <p className={cn('text-sm font-bold', (single ?? 0) < def.riskBelow ? 'text-red-tier' : (single ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-miami')}>
                  {single}{def.unit}
                </p>
              </div>
              {severity > 0 && (
                <div className="bg-red-tier-bg rounded-xl px-3 py-1.5">
                  <p className="text-[10px] text-red-tier font-bold uppercase tracking-wide">Below Normal</p>
                  <p className="text-sm font-bold text-red-tier">{severity}{def.unit}</p>
                </div>
              )}
            </>
          )}
          <div className="bg-surface rounded-xl px-3 py-1.5">
            <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Normal</p>
            <p className="text-xs font-semibold text-charcoal">{def.normalMin}–{def.normalMax}{def.unit}</p>
          </div>
        </div>
      </button>

      {open && rx && (
        <div className="px-5 pb-5 border-t border-miami-light pt-4 space-y-5">
          <RxItem label="Exercises (3)" icon={Dumbbell} color="text-miami" items={rx.exercises} />
          <RxItem label="Stretches (2)" icon={PersonStanding} color="text-miami/70" items={rx.stretches} />
          <RxItem label="Foam Rolling (1)" icon={Flame} color="text-charcoal-light" items={[rx.foam]} />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function MyProtocol() {
  const { user } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assessment, setAssessment] = useState<Record<string, any> | null>(null)
  const [loading, setLoading]       = useState(true)
  const [assessedAt, setAssessedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase.rpc('get_my_profile')
      if (data?.assessment) {
        setAssessment(data.assessment)
        setAssessedAt(data.assessment.assessed_at ?? null)
      }
      setLoading(false)
    })()
  }, [user])

  if (loading) return <Spinner />

  if (!assessment) return (
    <EmptyState
      icon={ClipboardList}
      title="No assessment yet"
      description="Complete your ROM assessment and your personal injury-prevention protocol will appear here."
    />
  )

  const scored = scoreJoints(assessment)
  const hasData = scored.some(s => s.left !== null || s.right !== null || s.single !== null)

  if (!hasData) return (
    <EmptyState
      icon={ClipboardList}
      title="Assessment processing"
      description="Your protocol will generate once assessment data has been processed."
    />
  )

  const ranked = scored
    .filter(s => s.left !== null || s.right !== null || s.single !== null)
    .sort((a, b) => {
      if (b.asymmetry !== a.asymmetry) return b.asymmetry - a.asymmetry
      return b.severity - a.severity
    })
    .slice(0, 3)

  const dateStr = assessedAt
    ? new Date(assessedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Recent assessment'

  return (
    <div className="space-y-5">
      {/* 1. Page header */}
      <PageHeader title="My Protocol" subtitle={`Based on assessment · ${dateStr}`} />

      {/* 2. Today card (hero) */}
      {assessedAt && user && (
        <TodayCard
          ranked={ranked}
          assessedAt={assessedAt}
          userId={user.id}
        />
      )}

      {/* 3. Why statement */}
      <WhyStatement />

      {/* 4. Retest status banner */}
      {assessedAt && <RetestBanner assessedAt={assessedAt} />}

      {/* 5. Full protocol (3 priority cards) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={14} className="text-miami shrink-0" />
          <p className="text-xs font-bold uppercase tracking-wider text-charcoal-light">Full Protocol</p>
        </div>
        <div className="space-y-4">
          {ranked.map((r, i) => (
            <IssueCard key={r.def.key} ranked={r} rank={i + 1} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-charcoal-light pb-2">
        Protocol auto-updates with each new assessment. Retest every 4–6 weeks.
      </p>
    </div>
  )
}
