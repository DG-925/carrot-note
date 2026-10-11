package com.carrotnote.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.carrotnote.app.update.UpdateWorker

class CarrotApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
        createChannels()
        if (Graph.settings.autoUpdate.value) UpdateWorker.schedule(this)

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) = Graph.lock.onAppBackground()
            override fun onStart(owner: LifecycleOwner) = Graph.lock.onAppForeground()
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
            NotificationChannel(CHANNEL_UPDATES, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "New versions of Carrot Note"
            }
        )
    }

    companion object {
        const val CHANNEL_REMINDERS = "reminders"
        const val CHANNEL_UPDATES = "updates"
    }
}
