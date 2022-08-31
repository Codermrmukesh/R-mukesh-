/**
    Copyright 2022 Google LLC

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        https://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
 */

import { PuppeteerRunnerExtension } from '../PuppeteerRunnerExtension.js';
import type { Step, UserFlow } from '../Schema.js';
import { isMobileFlow, isNavigationStep } from './helpers.js';

// @ts-expect-error Lighthouse doesn't expose types.
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
// @ts-expect-error Lighthouse doesn't expose types.
import { startFlow } from 'lighthouse/core/fraggle-rock/api.js';

export class LighthouseRunnerExtension extends PuppeteerRunnerExtension {
  #isTimespanRunning = false;
  #isNavigationRunning = false;
  #lhFlow?: any;

  async generateFlowResult() {
    if (!this.#lhFlow) {
      throw new Error('Cannot get flow result before running the flow');
    }
    return this.#lhFlow.createFlowResult();
  }

  override async beforeAllSteps(flow: UserFlow) {
    await super.beforeAllSteps?.(flow);

    this.#lhFlow = await startFlow(this.page, {
      config: isMobileFlow(flow) ? undefined : desktopConfig,
      flags: { screenEmulation: { disabled: true } },
      name: flow.title,
    });
  }

  override async beforeEachStep(step: Step, flow: UserFlow) {
    await super.beforeEachStep?.(step, flow);
    if (step.type === 'setViewport') return;

    if (isNavigationStep(step)) {
      if (this.#isTimespanRunning) {
        await this.#lhFlow.endTimespan();
        this.#isTimespanRunning = false;
      }
      await this.#lhFlow.startNavigation();
      this.#isNavigationRunning = true;
    } else if (!this.#isTimespanRunning) {
      await this.#lhFlow.startTimespan();
      this.#isTimespanRunning = true;
    }
  }

  override async afterEachStep(step: Step, flow: UserFlow) {
    if (this.#isNavigationRunning) {
      await this.#lhFlow.endNavigation();
      this.#isNavigationRunning = false;
    }
    await super.afterEachStep?.(step, flow);
  }

  override async afterAllSteps(flow: UserFlow) {
    if (this.#isTimespanRunning) {
      await this.#lhFlow.endTimespan();
    }
    await super.afterAllSteps?.(flow);
  }
}
