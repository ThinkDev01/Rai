package com.raimobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "RaiMobile"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    createNotificationChannel()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        "rai_default",
        "Rai Notifications",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Tickets, sprints, projects and org updates"
        enableVibration(true)
        enableLights(true)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
