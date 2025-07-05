"use client"

import * as React from "react"

// Simple toast implementation
type ToastType = "default" | "destructive"

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastType
}

let toastCount = 0

function genId() {
  toastCount = (toastCount + 1) % Number.MAX_SAFE_INTEGER
  return toastCount.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

interface ToastState {
  toasts: Toast[]
}

const listeners: Array<(state: ToastState) => void> = []
let memoryState: ToastState = { toasts: [] }

function dispatch(action: { type: string; toast?: Toast; toastId?: string }) {
  switch (action.type) {
    case "ADD_TOAST":
      if (action.toast) {
        memoryState = {
          toasts: [action.toast, ...memoryState.toasts].slice(0, 3), // Keep only 3 toasts
        }
      }
      break
    case "DISMISS_TOAST":
      if (action.toastId) {
        const timeout = setTimeout(() => {
          memoryState = {
            toasts: memoryState.toasts.filter((t) => t.id !== action.toastId),
          }
          listeners.forEach((listener) => listener(memoryState))
          toastTimeouts.delete(action.toastId!)
        }, 5000)
        toastTimeouts.set(action.toastId, timeout)
      }
      break
    case "REMOVE_TOAST":
      if (action.toastId) {
        memoryState = {
          toasts: memoryState.toasts.filter((t) => t.id !== action.toastId),
        }
      }
      break
  }
  listeners.forEach((listener) => listener(memoryState))
}

function toast({ title, description, variant = "default" }: Omit<Toast, "id">) {
  const id = genId()

  dispatch({
    type: "ADD_TOAST",
    toast: { id, title, description, variant },
  })

  // Auto dismiss after 5 seconds
  setTimeout(() => {
    dispatch({ type: "DISMISS_TOAST", toastId: id })
  }, 5000)

  return {
    id,
    dismiss: () => dispatch({ type: "REMOVE_TOAST", toastId: id }),
  }
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "REMOVE_TOAST", toastId }),
  }
}

export { useToast, toast }
