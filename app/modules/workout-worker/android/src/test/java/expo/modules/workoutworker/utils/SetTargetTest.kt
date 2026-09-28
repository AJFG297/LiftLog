package expo.modules.workoutworker.utils

import com.limajuice.liftlog.CurrentSetKind
import org.junit.Assert.assertEquals
import org.junit.Test

class SetTargetTest {
    @Test
    fun `a working set is its reps alone`() {
        assertEquals("5", formatSetTarget(CurrentSetKind.working, 5, 5))
        assertEquals("8-12", formatSetTarget(CurrentSetKind.working, 8, 12))
    }

    @Test
    fun `a drop, myo or failure set leads with its letter`() {
        assertEquals("D 12", formatSetTarget(CurrentSetKind.drop, 12, 12))
        assertEquals("M 12-15", formatSetTarget(CurrentSetKind.myo, 12, 15))
        assertEquals("F 5", formatSetTarget(CurrentSetKind.failure, 5, 5))
    }

    @Test
    fun `a warm-up has no letter, since the notification names it in words`() {
        assertEquals("5", formatSetTarget(CurrentSetKind.warmup, 5, 5))
    }
}
