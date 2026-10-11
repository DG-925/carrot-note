package com.carrotnote.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.carrotnote.app.update.UpdateWorker
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class CarrotApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
        createChannels()
        if (Graph.settings.autoUpdate.value) UpdateWorker.schedule(this)

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            private var poll: Job? = null

            override fun onStop(owner: LifecycleOwner) {
                Graph.lock.onAppBackground()
                poll?.cancel()
            }

            override fun onStart(owner: LifecycleOwner) {
                Graph.lock.onAppForeground()
                // While the app is open, pull teammates' changes regularly.
                poll?.cancel()
                poll = Graph.scope.launch {
                    while (true) {
                        Graph.sync.syncNow()
                        delay(45_000)
                    }
                }
            }
        })
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_REMINDERS, "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Task and calendar reminders"
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_TIMER, "Work timer", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows the running time tracker"
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_UPDATES, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "New versions of Carrot Note"
            }
        )
    }

    companion object {
        const val CHANNEL_TIMER = "timer"
        const val CHANNEL_REMINDERS = "reminders"
        const val CHANNEL_UPDATES = "updates"
    }
}
