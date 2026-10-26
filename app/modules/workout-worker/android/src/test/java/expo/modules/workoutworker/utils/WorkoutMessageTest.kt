package expo.modules.workoutworker.utils

import com.limajuice.liftlog.WorkoutMessage
import com.limajuice.liftlog.WorkoutUpdatedEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.math.BigDecimal
import kotlin.time.Instant

@RunWith(Parameterized::class)
class WorkoutMessageTest(private val storageVersion: Int) {
    @Test
    fun `a storage version does not prevent decoding a workout rest update`() {
        val fixture = requireNotNull(javaClass.getResource("/workout-updated-rest.json")).readText()
        val serialized = fixture.replace("\"version\": 11", "\"version\": $storageVersion")

        val message = Json.decodeFromString<WorkoutMessage>(serialized)

        assertTrue(message.appConfiguration.notificationsEnabled)
        val update = message.payload as WorkoutUpdatedEvent
        assertEquals(BigDecimal(storageVersion), update.workout.version)
        assertEquals("worker-rest-regression", update.workout.id)
        assertEquals("PT30S", update.workoutDuration)
        val rest = requireNotNull(update.restTimerInfo)
        assertEquals(Instant.parse("2026-10-26T12:00:00Z"), rest.startedAt)
        assertEquals(Instant.parse("2026-10-26T12:01:30Z"), rest.partiallyEndAt)
        assertEquals(rest.partiallyEndAt, rest.endAt)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "storage version {0}")
        fun storageVersions(): List<Array<Int>> = listOf(arrayOf(10), arrayOf(11), arrayOf(12))
    }
}
