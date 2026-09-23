import type { ComponentType } from 'react'
import type { Product } from '@/shared/api/types'
import type { Bounds } from './kit'

/** Specs that shape a model. Units follow the catalog spec keys (`backend/app/seeds/data/spec_keys.yaml`). */
export type Spec = {
  dims_mm?: [number, number, number]
  payload_kg?: number
  tow_kg?: number
  speed_mps?: number
  lift_mm?: number
  lift_min_mm?: number
  runtime_h?: number
  reach_mm?: number
  height_m?: number
}

export type Variant = {
  id: string
  name: string
  spec: Spec
  /** Spec keys we assumed for the drawing because neither the catalog nor research has them. */
  assumed?: (keyof Spec)[]
  /** Catalog product this built-in variant stands for, when the names differ. */
  match?: RegExp
}

export type ModelProps = { v: Variant; accent: string }

export type Kind = {
  id: string
  /** Catalog solution types drawn by this model: a new product of these classes gets it automatically. */
  classes: string[]
  /** Splits a class between models (street vs indoor cleaners, crane vs cube storage). */
  claims?: (p: Product) => boolean
  title: string
  group: string
  accent: string
  /** What the robot does, one line. */
  does: string
  /** Which specs drive which part of the model. */
  shape: string
  /** What the loop animation shows. */
  anim: string
  variants: Variant[]
  Model: ComponentType<ModelProps>
  bounds: (v: Variant) => Bounds
}

export const mm = (d: [number, number, number] | undefined, fallback: [number, number, number]) =>
  (d ?? fallback).map((x) => x / 1000) as [number, number, number]
