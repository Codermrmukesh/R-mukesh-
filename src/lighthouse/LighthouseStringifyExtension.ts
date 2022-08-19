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

import { PuppeteerStringifyExtension } from '../PuppeteerStringifyExtension.js';

import type { LineWriter } from '../LineWriter.js';
import type { Step, UserFlow } from '../Schema.js';

function isNavigationStep(step: Step): boolean {
  return Boolean(
    step.type === 'navigate' ||
      step.assertedEvents?.some((event) => event.type === 'navigation')
  );
}

export class LighthouseStringifyExtension extends PuppeteerStringifyExtension {
  #isProcessingTimespan = false;

  override async beforeAllSteps(out: LineWriter, flow: UserFlow) {
    out.appendLine(`const fs = require('fs');`);

    let isMobile = true;
    for (const step of flow.steps) {
      if (step.type !== 'setViewport') continue;
      isMobile = step.isMobile;
    }

    await super.beforeAllSteps(out, flow);

    const flags = {
      screenEmulation: {
        disabled: true,
      },
    };
    out.appendLine(`const flags = ${JSON.stringify(flags)}`);
    if (isMobile) {
      out.appendLine(`const config = undefined;`);
    } else {
      // eslint-disable-next-line max-len
      out.appendLine(
        `const config = (await import('lighthouse/core/config/desktop-config.js')).default;`
      );
    }

    out.appendLine(
      `const lhApi = await import('lighthouse/core/fraggle-rock/api.js');`
    );
    // eslint-disable-next-line max-len
    out.appendLine(
      `const lhFlow = await lhApi.startFlow(page, {name: ${JSON.stringify(
        flow.title
      )}, config, flags});`
    );
  }

  override async stringifyStep(out: LineWriter, step: Step, flow: UserFlow) {
    if (step.type === 'setViewport') {
      await super.stringifyStep(out, step, flow);
      return;
    }

    const isNavigation = isNavigationStep(step);

    if (isNavigation) {
      if (this.#isProcessingTimespan) {
        out.appendLine(`await lhFlow.endTimespan();`);
        this.#isProcessingTimespan = false;
      }
      out.appendLine(`await lhFlow.startNavigation();`);
    } else if (!this.#isProcessingTimespan) {
      out.appendLine(`await lhFlow.startTimespan();`);
      this.#isProcessingTimespan = true;
    }

    await super.stringifyStep(out, step, flow);

    if (isNavigation) {
      out.appendLine(`await lhFlow.endNavigation();`);
    }
  }

  override async afterAllSteps(out: LineWriter, flow: UserFlow) {
    if (this.#isProcessingTimespan) {
      out.appendLine(`await lhFlow.endTimespan();`);
    }
    out.appendLine(`const lhFlowReport = await lhFlow.generateReport();`);
    out.appendLine(
      `fs.writeFileSync(__dirname + '/flow.report.html', lhFlowReport)`
    );
    await super.afterAllSteps(out, flow);
  }
}
