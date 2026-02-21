package com.aicoach

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

/**
 * VisionCamera v4 frame processor plugin — true AR text recognition.
 * Runs Google MLKit on every camera frame (no snapshots, no delay).
 * JS usage:  const result = scanText(frame)
 * Returns:   { text, blocks: [{text,x,y,width,height}], frameWidth, frameHeight }
 */
class TextScannerPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

    private val recognizer =
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    @OptIn(ExperimentalGetImage::class)
    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        return try {
            val imageProxy = frame.imageProxy
            val mediaImage = imageProxy.image ?: return null

            val inputImage = InputImage.fromMediaImage(
                mediaImage,
                imageProxy.imageInfo.rotationDegrees
            )

            // Block the VisionCamera background thread until MLKit returns
            val visionText = Tasks.await(recognizer.process(inputImage))

            val blocks = visionText.textBlocks.map { block ->
                val rect = block.boundingBox
                mapOf(
                    "text"   to block.text,
                    "x"      to (rect?.left    ?: 0),
                    "y"      to (rect?.top     ?: 0),
                    "width"  to (rect?.width() ?: 0),
                    "height" to (rect?.height() ?: 0)
                )
            }

            mapOf(
                "text"        to visionText.text,
                "blocks"      to blocks,
                "frameWidth"  to imageProxy.width,
                "frameHeight" to imageProxy.height
            )
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        fun register() {
            FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options ->
                TextScannerPlugin(proxy, options)
            }
        }
    }
}
